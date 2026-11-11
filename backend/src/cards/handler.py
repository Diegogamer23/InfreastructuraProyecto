import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)
table = boto3.resource("dynamodb").Table(os.environ["CARDS_TABLE_NAME"])
MAX_AMOUNT = Decimal("999999999.99")


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
    if isinstance(raw, dict):
        return raw
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


def parse_amount(value, field, allow_zero):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"{field} debe ser un monto válido.") from None

    if not amount.is_finite() or amount < 0 or (not allow_zero and amount == 0):
        comparator = "no puede ser negativo" if allow_zero else "debe ser mayor que cero"
        raise ValueError(f"{field} {comparator}.")
    if amount > MAX_AMOUNT:
        raise ValueError(f"{field} supera el máximo permitido.")
    if amount.as_tuple().exponent < -2:
        raise ValueError(f"{field} admite hasta dos decimales.")
    return amount


def parse_day(value, field):
    try:
        day = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field} debe ser un día entre 1 y 31.") from None
    if isinstance(value, bool) or str(day) != str(value).strip() or not 1 <= day <= 31:
        raise ValueError(f"{field} debe ser un día entre 1 y 31.")
    return day


def list_cards(user_id):
    result = table.query(
        KeyConditionExpression=Key("userId").eq(user_id),
        ScanIndexForward=False,
        Limit=100,
    )
    cards = result.get("Items", [])
    return response(200, {"count": len(cards), "cards": cards})


def save_card(payload, user_id):
    name = str(payload.get("name", "")).strip()
    issuer = str(payload.get("issuer", "")).strip()
    if not name or len(name) > 80:
        raise ValueError("name es obligatorio y debe tener hasta 80 caracteres.")
    if not issuer or len(issuer) > 60:
        raise ValueError("issuer es obligatorio y debe tener hasta 60 caracteres.")

    credit_limit = parse_amount(payload.get("creditLimit"), "creditLimit", False)
    current_balance = parse_amount(payload.get("currentBalance", "0"), "currentBalance", True)
    cutoff_day = parse_day(payload.get("cutoffDay"), "cutoffDay")
    payment_due_day = parse_day(payload.get("paymentDueDay"), "paymentDueDay")

    supplied_card_id = str(payload.get("cardId", "")).strip()
    if supplied_card_id and not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", supplied_card_id):
        raise ValueError("cardId tiene un formato no válido.")

    card_id = supplied_card_id or uuid.uuid4().hex
    existing = table.get_item(Key={"userId": user_id, "cardId": card_id}).get("Item")
    now = (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    item = {
        "userId": user_id,
        "cardId": card_id,
        "name": name,
        "issuer": issuer,
        "creditLimit": credit_limit,
        "currentBalance": current_balance,
        "cutoffDay": cutoff_day,
        "paymentDueDay": payment_due_day,
        "createdAt": existing.get("createdAt", now) if existing else now,
        "updatedAt": now,
    }
    table.put_item(Item=item)
    logger.info("Tarjeta guardada: cardId=%s", card_id)
    status_code = 200 if existing else 201
    message = "Tarjeta actualizada." if existing else "Tarjeta guardada."
    return response(status_code, {"message": message, "card": item})


def handler(event, context):
    try:
        user_id = authenticated_user_id(event)
        if not user_id:
            return response(401, {"message": "Se requiere iniciar sesión."})

        request_context = event.get("requestContext") or {}
        http_context = request_context.get("http") or {}
        method = str(http_context.get("method", "")).upper()

        if method == "GET":
            return list_cards(user_id)
        if method == "POST":
            return save_card(parse_body(event), user_id)
        return response(405, {"message": "Método no permitido. Usa GET o POST."})
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
        return response(400, {"message": str(error)})
    except Exception:
        logger.exception("Error procesando la tarjeta")
        return response(500, {"message": "Error interno. Revisa CloudWatch Logs."})
