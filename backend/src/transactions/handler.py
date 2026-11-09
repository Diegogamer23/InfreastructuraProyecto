import base64
import json
import logging
import os
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)
table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
DEMO_USER_ID = "demo-user"


def json_default(value):
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"Tipo no serializable: {type(value).__name__}")


def response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(payload, default=json_default, ensure_ascii=False),
    }


def parse_body(event):
    raw = event.get("body")
    if raw is None:
        return {}
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("El cuerpo debe ser un objeto JSON.")
    return payload


def authenticated_user_id(event):
    request_context = event.get("requestContext") or {}
    authorizer = request_context.get("authorizer") or {}
    jwt = authorizer.get("jwt") or {}
    claims = jwt.get("claims") or {}
    return str(claims.get("sub", "")).strip()


def create_transaction(payload, user_id):
    try:
        amount = Decimal(str(payload["amount"]))
    except (KeyError, InvalidOperation, TypeError, ValueError):
        return response(400, {"message": "amount debe ser un numero valido."})

    if not amount.is_finite() or amount <= 0:
        return response(400, {"message": "amount debe ser mayor que cero."})

    category = str(payload.get("category", "")).strip()
    if not category:
        return response(400, {"message": "category es obligatorio."})

    transaction_type = str(payload.get("type", "expense")).strip().lower()
    if transaction_type not in ("expense", "income"):
        return response(400, {"message": "type debe ser expense o income."})

    status = str(payload.get("status", "actual")).strip().lower()
    if status not in ("actual", "planned"):
        return response(400, {"message": "status debe ser actual o planned."})

    transaction_date = str(
        payload.get("date", datetime.now(timezone.utc).date().isoformat())
    ).strip()
    try:
        date.fromisoformat(transaction_date)
    except ValueError:
        return response(400, {"message": "date debe tener formato YYYY-MM-DD."})

    payment_method = str(payload.get("paymentMethod", "cash")).strip().lower()
    if payment_method not in ("cash", "debit", "credit"):
        return response(
            400,
            {"message": "paymentMethod debe ser cash, debit o credit."},
        )

    created_at = (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    transaction_id = f"{created_at}#{uuid.uuid4().hex}"

    item = {
        "userId": user_id,
        "transactionId": transaction_id,
        "type": transaction_type,
        "status": status,
        "amount": amount,
        "category": category[:60],
        "description": str(payload.get("description", "")).strip()[:200],
        "date": transaction_date,
        "paymentMethod": payment_method,
        "createdAt": created_at,
    }

    card_id = str(payload.get("cardId", "")).strip()
    if card_id:
        item["cardId"] = card_id

    table.put_item(Item=item)
    logger.info("Movimiento guardado: transactionId=%s", transaction_id)
    return response(
        201,
        {"message": "Movimiento guardado.", "transaction": item},
    )


def list_transactions(user_id):
    result = table.query(
        KeyConditionExpression=Key("userId").eq(user_id),
        ScanIndexForward=False,
        Limit=100,
    )
    return response(
        200,
        {
            "count": result.get("Count", 0),
            "transactions": result.get("Items", []),
        },
    )


def handler(event, context):
    try:
        if event.get("action") == "save-demo":
            return create_transaction(
                {
                    "amount": "150.00",
                    "category": "comida",
                    "description": "Gasto de demostracion",
                    "type": "expense",
                    "status": "actual",
                },
                DEMO_USER_ID,
            )

        user_id = authenticated_user_id(event)
        if not user_id:
            return response(401, {"message": "Se requiere iniciar sesion."})

        request_context = event.get("requestContext") or {}
        http_context = request_context.get("http") or {}
        method = str(http_context.get("method", "")).upper()

        if method == "POST":
            return create_transaction(parse_body(event), user_id)
        if method == "GET":
            return list_transactions(user_id)

        return response(
            405,
            {"message": "Metodo no permitido. Usa GET o POST."},
        )
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
        return response(400, {"message": str(error)})
    except Exception:
        logger.exception("Error procesando la solicitud")
        return response(
            500,
            {"message": "Error interno. Revisa CloudWatch Logs."},
        )

