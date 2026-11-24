import os
import re
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import boto3
from botocore.exceptions import ClientError

BUCKET_NAME = os.environ.get("RECEIPTS_BUCKET_NAME", "")
MAX_RECEIPT_BYTES = 10 * 1024 * 1024
PRESIGNED_URL_SECONDS = 300
ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "application/pdf",
}

s3 = boto3.client("s3")
textract = boto3.client("textract")


class ReceiptServiceError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code


def normalize_receipt_id(value):
    try:
        return str(uuid.UUID(value))
    except (TypeError, ValueError, AttributeError):
        raise ReceiptServiceError(400, "El identificador del ticket no es válido.")


def receipt_key(user_id, receipt_id):
    return f"receipts/{user_id}/{normalize_receipt_id(receipt_id)}"


def require_bucket():
    if not BUCKET_NAME:
        raise RuntimeError("Falta configurar RECEIPTS_BUCKET_NAME.")


def create_upload(user_id, payload):
    require_bucket()
    content_type = str(payload.get("contentType", "")).strip().lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ReceiptServiceError(
            400,
            "Elige una imagen JPG o PNG, o un PDF de una página.",
        )

    receipt_id = str(uuid.uuid4())
    key = receipt_key(user_id, receipt_id)
    upload = s3.generate_presigned_post(
        Bucket=BUCKET_NAME,
        Key=key,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, MAX_RECEIPT_BYTES],
        ],
        ExpiresIn=PRESIGNED_URL_SECONDS,
    )
    return {
        "receiptId": receipt_id,
        "uploadUrl": upload["url"],
        "fields": upload["fields"],
        "expiresInSeconds": PRESIGNED_URL_SECONDS,
    }


def head_receipt(user_id, receipt_id):
    require_bucket()
    key = receipt_key(user_id, receipt_id)
    try:
        metadata = s3.head_object(Bucket=BUCKET_NAME, Key=key)
    except ClientError as error:
        error_code = error.response.get("Error", {}).get("Code", "")
        status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if error_code in ("404", "NoSuchKey", "NotFound") or status == 404:
            raise ReceiptServiceError(404, "No encontré ese ticket. Súbelo otra vez.")
        raise

    if metadata.get("ContentLength", 0) < 1 or metadata.get("ContentLength", 0) > MAX_RECEIPT_BYTES:
        raise ReceiptServiceError(400, "El archivo debe pesar 10 MB o menos.")
    if metadata.get("ContentType", "").lower() not in ALLOWED_CONTENT_TYPES:
        raise ReceiptServiceError(400, "El formato del ticket no es compatible.")
    return key, metadata


def ensure_receipt_exists(user_id, receipt_id):
    head_receipt(user_id, receipt_id)


def find_summary_field(document, accepted_types):
    candidates = []
    for field in document.get("SummaryFields", []):
        field_type = (field.get("Type") or {}).get("Text", "").upper()
        value_detection = field.get("ValueDetection") or {}
        value = str(value_detection.get("Text", "")).strip()
        if field_type in accepted_types and value:
            candidates.append((field_type, value, value_detection))

    for accepted_type in accepted_types:
        matching = [item for item in candidates if item[0] == accepted_type]
        if matching:
            return max(
                matching,
                key=lambda item: float(item[2].get("Confidence", 0)),
            )
    return None


def normalize_amount(value):
    if not value:
        return None
    cleaned = re.sub(r"[^0-9,.-]", "", value)
    if not re.search(r"\d", cleaned):
        return None

    if "," in cleaned and "." in cleaned:
        if cleaned.rfind(".") > cleaned.rfind(","):
            cleaned = cleaned.replace(",", "")
        else:
            cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        decimal_places = len(cleaned) - cleaned.rfind(",") - 1
        cleaned = cleaned.replace(",", ".") if decimal_places in (1, 2) else cleaned.replace(",", "")
    elif cleaned.count(".") > 1:
        parts = cleaned.split(".")
        cleaned = "".join(parts[:-1]) + "." + parts[-1] if len(parts[-1]) in (1, 2) else "".join(parts)
    elif "." in cleaned and len(cleaned) - cleaned.rfind(".") - 1 > 2:
        cleaned = cleaned.replace(".", "")

    try:
        amount = Decimal(cleaned)
    except InvalidOperation:
        return None
    return format(amount, ".2f") if amount.is_finite() and amount > 0 else None


def normalize_date(value):
    if not value:
        return None
    candidates = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y")
    for date_format in candidates:
        try:
            return datetime.strptime(value.strip(), date_format).date().isoformat()
        except ValueError:
            continue
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        return None


def analyze_receipt(user_id, receipt_id):
    key, metadata = head_receipt(user_id, receipt_id)
    try:
        result = textract.analyze_expense(
            Document={"S3Object": {"Bucket": BUCKET_NAME, "Name": key}}
        )
    except textract.exceptions.BadDocumentException:
        raise ReceiptServiceError(422, "No pude leer el ticket. Intenta con una foto más clara.")
    except textract.exceptions.UnsupportedDocumentException:
        raise ReceiptServiceError(422, "El ticket no es una imagen o PDF compatible.")
    except textract.exceptions.DocumentTooLargeException:
        raise ReceiptServiceError(400, "El archivo supera el límite de lectura de 10 MB.")
    except textract.exceptions.ThrottlingException:
        raise ReceiptServiceError(503, "Hay muchas lecturas en este momento. Intenta más tarde.")

    documents = result.get("ExpenseDocuments", [])
    document = documents[0] if documents else {}
    total_field = find_summary_field(
        document,
        ("TOTAL", "AMOUNT_DUE", "INVOICE_TOTAL", "GRAND_TOTAL"),
    )
    if not total_field:
        raise ReceiptServiceError(
            422,
            "No pude identificar el total. Captúralo manualmente o intenta otra foto.",
        )

    raw_total = total_field[1]
    amount = normalize_amount(raw_total)
    if not amount:
        raise ReceiptServiceError(
            422,
            "No pude leer el monto con seguridad. Captúralo manualmente.",
        )

    vendor_field = find_summary_field(document, ("VENDOR_NAME", "NAME"))
    date_field = find_summary_field(document, ("INVOICE_RECEIPT_DATE", "DATE"))
    tax_field = find_summary_field(document, ("TAX", "TOTAL_TAX"))
    currency = (total_field[2].get("Currency") or {}).get("Code")

    items = []
    for group in document.get("LineItemGroups", []):
        for line_item in group.get("LineItems", []):
            values = {}
            for expense_field in line_item.get("LineItemExpenseFields", []):
                field_type = (expense_field.get("Type") or {}).get("Text", "").upper()
                field_value = (expense_field.get("ValueDetection") or {}).get("Text", "")
                if field_type and field_value:
                    values[field_type] = field_value
            if values:
                items.append(values)

    raw_date = date_field[1] if date_field else ""
    return {
        "receiptId": receipt_id,
        "draft": {
            "merchant": vendor_field[1] if vendor_field else "",
            "amount": amount,
            "rawTotal": raw_total,
            "date": normalize_date(raw_date),
            "rawDate": raw_date,
            "tax": normalize_amount(tax_field[1]) if tax_field else None,
            "currency": currency,
            "confidence": round(float(total_field[2].get("Confidence", 0)), 1),
            "items": items[:20],
        },
        "fileSizeBytes": metadata.get("ContentLength", 0),
    }


def get_receipt_url(user_id, receipt_id):
    key, _ = head_receipt(user_id, receipt_id)
    url = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": BUCKET_NAME,
            "Key": key,
            "ResponseContentDisposition": "inline",
        },
        ExpiresIn=PRESIGNED_URL_SECONDS,
    )
    return {"url": url, "expiresInSeconds": PRESIGNED_URL_SECONDS}
