import base64
import json
import logging
import os
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

table = boto3.resource("dynamodb").Table(os.environ["BUDGETS_TABLE_NAME"])
ALLOWED_CATEGORIES = {
    "comida",
    "vivienda",
    "transporte",
    "servicios",
    "salud",
    "escuela",
    "ropa",
    "entretenimiento",
    "ahorro",
    "otros",
}


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


def authenticated_user_id(event):
    request_context = event.get("requestContext") or {}
    authorizer = request_context.get("authorizer") or {}
    jwt = authorizer.get("jwt") or {}
    claims = jwt.get("claims") or {}
    return str(claims.get("sub", "")).strip()


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


def validate_month(value):
    month = str(value or "").strip()
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise ValueError("month debe tener formato YYYY-MM.")
    try:
        datetime.strptime(month, "%Y-%m")
    except ValueError as error:
        raise ValueError("month debe tener formato YYYY-MM.") from error
    return month


def list_budgets(user_id, month):
    key_condition = Key("userId").eq(user_id)
    if month:
        key_condition = key_condition & Key("budgetKey").begins_with(f"{month}#")

    result = table.query(
        KeyConditionExpression=key_condition,
        ScanIndexForward=False,
        Limit=100,
    )
    budgets = result.get("Items", [])
    return response(200, {"count": len(budgets), "budgets": budgets})


def save_budget(payload, user_id):
    month = validate_month(payload.get("month"))
    category = str(payload.get("category", "")).strip().lower()
    if category not in ALLOWED_CATEGORIES:
        return response(400, {"message": "category no es una categoría válida."})

    try:
        limit_amount = Decimal(str(payload["limitAmount"]))
    except (KeyError, InvalidOperation, TypeError, ValueError):
        return response(400, {"message": "limitAmount debe ser un número válido."})

    if not limit_amount.is_finite() or limit_amount <= 0:
        return response(400, {"message": "limitAmount debe ser mayor que cero."})

    updated_at = (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )
    item = {
        "userId": user_id,
        "budgetKey": f"{month}#{category}",
        "month": month,
        "category": category,
        "limitAmount": limit_amount,
        "updatedAt": updated_at,
    }
    table.put_item(Item=item)
    logger.info("Presupuesto guardado: month=%s category=%s", month, category)
    return response(201, {"message": "Presupuesto guardado.", "budget": item})


def handler(event, context):
    try:
        user_id = authenticated_user_id(event)
        if not user_id:
            return response(401, {"message": "Se requiere iniciar sesión."})

        request_context = event.get("requestContext") or {}
        http_context = request_context.get("http") or {}
        method = str(http_context.get("method", "")).upper()

        if method == "GET":
            query = event.get("queryStringParameters") or {}
            month_value = query.get("month")
            month = validate_month(month_value) if month_value else ""
            return list_budgets(user_id, month)
        if method == "POST":
            return save_budget(parse_body(event), user_id)

        return response(405, {"message": "Método no permitido. Usa GET o POST."})
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
        return response(400, {"message": str(error)})
    except Exception:
        logger.exception("Error procesando el presupuesto")
        return response(500, {"message": "Error interno. Revisa CloudWatch Logs."})
