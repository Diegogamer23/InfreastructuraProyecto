import base64
import calendar
import json
import logging
import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
goals_table = dynamodb.Table(os.environ["GOALS_TABLE_NAME"])
transactions_table = dynamodb.Table(os.environ["TRANSACTIONS_TABLE_NAME"])
budgets_table = dynamodb.Table(os.environ["BUDGETS_TABLE_NAME"])
cards_table = dynamodb.Table(os.environ["CARDS_TABLE_NAME"])
LOCAL_TIMEZONE = timezone(timedelta(hours=-5))
MAX_GOALS = 30


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


def month_value(value):
    month = str(value or "").strip()
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
        raise ValueError("month debe tener formato YYYY-MM.")
    datetime.strptime(month, "%Y-%m")
    return month


def query_all(table, user_id, sort_key=None, prefix=None, limit=100):
    condition = Key("userId").eq(user_id)
    if sort_key and prefix:
        condition = condition & Key(sort_key).begins_with(prefix)

    items = []
    request = {
        "KeyConditionExpression": condition,
        "ScanIndexForward": False,
        "Limit": limit,
    }
    while True:
        page = table.query(**request)
        items.extend(page.get("Items", []))
        last_key = page.get("LastEvaluatedKey")
        if not last_key:
            break
        request["ExclusiveStartKey"] = last_key
    return items


def list_goals(user_id):
    goals = query_all(goals_table, user_id, "goalId", limit=100)
    return response(200, {"count": len(goals), "goals": goals})


def save_goal(payload, user_id):
    name = str(payload.get("name", "")).strip()
    if not name or len(name) > 80:
        raise ValueError("name es obligatorio y debe tener hasta 80 caracteres.")

    try:
        target_amount = Decimal(str(payload["targetAmount"]))
        current_amount = Decimal(str(payload.get("currentAmount", "0")))
    except (KeyError, InvalidOperation, TypeError, ValueError):
        raise ValueError("targetAmount y currentAmount deben ser números válidos.")

    if not target_amount.is_finite() or target_amount <= 0:
        raise ValueError("targetAmount debe ser mayor que cero.")
    if not current_amount.is_finite() or current_amount < 0:
        raise ValueError("currentAmount no puede ser negativo.")
    if target_amount > Decimal("999999999.99") or current_amount > Decimal("999999999.99"):
        raise ValueError("El monto máximo permitido es 999999999.99.")

    target_date = str(payload.get("targetDate", "")).strip()
    if target_date:
        try:
            date.fromisoformat(target_date)
        except ValueError as error:
            raise ValueError("targetDate debe tener formato YYYY-MM-DD.") from error

    goal_id = str(payload.get("goalId", "")).strip() or uuid.uuid4().hex
    existing = goals_table.get_item(Key={"userId": user_id, "goalId": goal_id}).get("Item")
    if payload.get("goalId") and not existing:
        return response(404, {"message": "No se encontró esa meta en tu cuenta."})

    if not existing and len(query_all(goals_table, user_id, "goalId", limit=MAX_GOALS + 1)) >= MAX_GOALS:
        return response(400, {"message": f"Puedes registrar hasta {MAX_GOALS} metas."})

    now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    item = {
        "userId": user_id,
        "goalId": goal_id,
        "name": name,
        "targetAmount": target_amount.quantize(Decimal("0.01")),
        "currentAmount": current_amount.quantize(Decimal("0.01")),
        "targetDate": target_date,
        "createdAt": existing.get("createdAt", now) if existing else now,
        "updatedAt": now,
    }
    goals_table.put_item(Item=item)
    logger.info("Meta guardada: goalId=%s", goal_id)
    return response(201 if not existing else 200, {"message": "Meta guardada.", "goal": item})


def month_transactions(user_id, month):
    return query_all(transactions_table, user_id, "transactionId", month, limit=200)


def recent_transactions(user_id):
    page = transactions_table.query(
        KeyConditionExpression=Key("userId").eq(user_id),
        ScanIndexForward=False,
        Limit=200,
    )
    return page.get("Items", [])


def monthly_report(user_id, month):
    transactions = month_transactions(user_id, month)
    budgets = query_all(budgets_table, user_id, "budgetKey", f"{month}#", limit=100)
    goals = query_all(goals_table, user_id, "goalId", limit=100)

    income = Decimal("0")
    expenses = Decimal("0")
    planned_expenses = Decimal("0")
    category_totals = {}
    for transaction in transactions:
        try:
            amount = Decimal(str(transaction.get("amount", "0")))
        except InvalidOperation:
            continue
        if not amount.is_finite() or amount < 0:
            continue
        if transaction.get("type") == "income":
            if transaction.get("status") != "planned":
                income += amount
            continue
        if transaction.get("status") == "planned":
            planned_expenses += amount
            continue
        expenses += amount
        category = str(transaction.get("category", "otros")).strip().lower() or "otros"
        category_totals[category] = category_totals.get(category, Decimal("0")) + amount

    budget_rows = []
    for budget in budgets:
        category = str(budget.get("category", "otros")).lower()
        try:
            limit = Decimal(str(budget.get("limitAmount", "0")))
        except InvalidOperation:
            limit = Decimal("0")
        spent = category_totals.get(category, Decimal("0"))
        budget_rows.append({
            "category": category,
            "limitAmount": limit,
            "spent": spent,
            "remaining": limit - spent,
            "percentUsed": round(float(spent / limit * 100), 1) if limit > 0 else 0,
        })
    budget_rows.sort(key=lambda item: item["percentUsed"], reverse=True)

    categories = [
        {"category": category, "amount": amount}
        for category, amount in sorted(category_totals.items(), key=lambda pair: pair[1], reverse=True)
    ]
    net = income - expenses
    insights = []
    if not transactions:
        insights.append("Todavía no hay movimientos este mes. Registra ingresos y gastos para construir tu reporte.")
    elif income == 0 and expenses > 0:
        insights.append("No registraste ingresos este mes; agregar tus entradas ayuda a comparar mejor lo que gastas.")
    elif expenses > income:
        insights.append("Tus gastos registrados superan tus ingresos del mes. Revisa las categorías y los gastos previstos antes de asumir nuevos compromisos.")
    elif income > 0:
        insights.append(f"Después de tus gastos reales, quedan {net:.2f} MXN de tus ingresos registrados.")
    if categories and expenses > 0:
        top = categories[0]
        if Decimal(str(top["amount"])) / expenses >= Decimal("0.40"):
            insights.append(f"{top['category'].capitalize()} representa una parte importante de tus gastos del mes; revisa si el monto coincide con tu prioridad.")
    if planned_expenses > max(net, Decimal("0")):
        insights.append("Tus gastos previstos superan el dinero que queda después de los gastos reales. Considera ajustar fechas o montos.")
    near_limits = [item for item in budget_rows if item["percentUsed"] >= 80]
    if near_limits:
        insights.append(f"{len(near_limits)} presupuesto(s) alcanzaron al menos el 80% de su límite.")
    if not insights:
        insights.append("Vas dentro de lo registrado. Mantén tus movimientos al día para que el reporte siga siendo útil.")

    return response(200, {
        "month": month,
        "currency": "MXN",
        "transactionCount": len(transactions),
        "income": income,
        "expenses": expenses,
        "plannedExpenses": planned_expenses,
        "net": net,
        "categories": categories,
        "budgets": budget_rows,
        "goals": goals,
        "insights": insights,
    })


def next_due_date(day_value, today):
    try:
        day = int(day_value)
    except (TypeError, ValueError):
        return None
    if day < 1 or day > 31:
        return None
    year, month = today.year, today.month
    candidate = date(year, month, min(day, calendar.monthrange(year, month)[1]))
    if candidate < today:
        month += 1
        if month == 13:
            year, month = year + 1, 1
        candidate = date(year, month, min(day, calendar.monthrange(year, month)[1]))
    return candidate


def build_notifications(user_id):
    today = datetime.now(LOCAL_TIMEZONE).date()
    month = today.strftime("%Y-%m")
    cards = query_all(cards_table, user_id, "cardId", limit=100)
    budgets = query_all(budgets_table, user_id, "budgetKey", f"{month}#", limit=100)
    month_rows = month_transactions(user_id, month)
    recent_rows = recent_transactions(user_id)
    transactions = list({
        str(item.get("transactionId", uuid.uuid4().hex)): item
        for item in [*month_rows, *recent_rows]
    }.values())
    goals = query_all(goals_table, user_id, "goalId", limit=100)
    notices = []

    for card in cards:
        try:
            balance = Decimal(str(card.get("currentBalance", "0")))
        except InvalidOperation:
            balance = Decimal("0")
        due = next_due_date(card.get("paymentDueDay"), today)
        if balance <= 0 or not due:
            continue
        days = (due - today).days
        if days > 30:
            continue
        level = "danger" if days <= 2 else "warning" if days <= 7 else "info"
        label = "Vence hoy" if days == 0 else "Vence mañana" if days == 1 else f"Vence en {days} días"
        notices.append({
            "id": f"card-{card.get('cardId', '')}",
            "level": level,
            "label": label,
            "title": f"Pago próximo: {card.get('name', 'tarjeta')}",
            "description": f"{card.get('issuer') or 'Tarjeta'} · saldo registrado de {balance:.2f} MXN · fecha límite {due.isoformat()}.",
            "href": "/app/cards",
            "sortDate": due.isoformat(),
            "icon": "◷",
        })

    spent_by_category = {}
    for transaction in transactions:
        if not str(transaction.get("date", "")).startswith(month):
            continue
        if transaction.get("type") == "income" or transaction.get("status") == "planned":
            continue
        try:
            amount = Decimal(str(transaction.get("amount", "0")))
        except InvalidOperation:
            continue
        category = str(transaction.get("category", "otros")).lower()
        spent_by_category[category] = spent_by_category.get(category, Decimal("0")) + amount
    for budget in budgets:
        category = str(budget.get("category", "otros")).lower()
        try:
            limit = Decimal(str(budget.get("limitAmount", "0")))
        except InvalidOperation:
            continue
        spent = spent_by_category.get(category, Decimal("0"))
        if limit <= 0 or spent / limit < Decimal("0.80"):
            continue
        over = spent > limit
        percent = round(float(spent / limit * 100))
        notices.append({
            "id": f"budget-{budget.get('budgetKey', category)}",
            "level": "danger" if over else "warning",
            "label": "Límite superado" if over else f"{percent}% del límite",
            "title": f"{category.capitalize()}: {'revisar gasto' if over else 'límite casi alcanzado'}",
            "description": f"Llevas {spent:.2f} de {limit:.2f} MXN presupuestados para este mes.",
            "href": "/app/budgets",
            "sortDate": today.isoformat(),
            "icon": "!" if over else "↗",
        })

    for transaction in transactions:
        if transaction.get("status") != "planned" or transaction.get("type") == "income":
            continue
        try:
            planned_date = date.fromisoformat(str(transaction.get("date", ""))[:10])
            amount = Decimal(str(transaction.get("amount", "0")))
        except (ValueError, InvalidOperation):
            continue
        days = (planned_date - today).days
        if days < 0 or days > 14:
            continue
        label = "Planeado para hoy" if days == 0 else "Planeado para mañana" if days == 1 else f"En {days} días"
        notices.append({
            "id": f"planned-{transaction.get('transactionId', '')}",
            "level": "warning" if days <= 2 else "info",
            "label": label,
            "title": transaction.get("description") or f"Gasto previsto: {transaction.get('category', 'otros')}",
            "description": f"{str(transaction.get('category', 'otros')).capitalize()} · {amount:.2f} MXN · {planned_date.isoformat()}.",
            "href": "/app/movements",
            "sortDate": planned_date.isoformat(),
            "icon": "↗",
        })

    for goal in goals:
        target_date = str(goal.get("targetDate", "")).strip()
        if not target_date:
            continue
        try:
            due = date.fromisoformat(target_date)
        except ValueError:
            continue
        days = (due - today).days
        if days < 0 or days > 7:
            continue
        current = Decimal(str(goal.get("currentAmount", "0")))
        target = Decimal(str(goal.get("targetAmount", "0")))
        if target <= 0 or current >= target:
            continue
        remaining = target - current
        notices.append({
            "id": f"goal-{goal.get('goalId', '')}",
            "level": "warning" if days <= 2 else "info",
            "label": "Meta próxima" if days else "Meta vence hoy",
            "title": f"Revisa tu meta: {goal.get('name', 'Ahorro')}",
            "description": f"Faltan {remaining:.2f} MXN para tu objetivo con fecha {due.isoformat()}.",
            "href": "/app/goals",
            "sortDate": due.isoformat(),
            "icon": "✦",
        })

    priority = {"danger": 0, "warning": 1, "info": 2}
    notices.sort(key=lambda item: (priority.get(item["level"], 3), item["sortDate"]))
    return response(200, {
        "count": len(notices),
        "notices": notices,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
    })


def handler(event, context):
    try:
        user_id = authenticated_user_id(event)
        if not user_id:
            return response(401, {"message": "Se requiere iniciar sesión."})

        request_context = event.get("requestContext") or {}
        http_context = request_context.get("http") or {}
        method = str(http_context.get("method", "")).upper()
        path = str(http_context.get("path", ""))

        if path == "/goals" and method == "GET":
            return list_goals(user_id)
        if path == "/goals" and method == "POST":
            return save_goal(parse_body(event), user_id)
        if path == "/notifications" and method == "GET":
            return build_notifications(user_id)
        if path == "/reports/monthly" and method == "GET":
            query = event.get("queryStringParameters") or {}
            now = datetime.now(LOCAL_TIMEZONE)
            month = month_value(query.get("month") or now.strftime("%Y-%m"))
            return monthly_report(user_id, month)

        return response(405, {"message": "Método o ruta no permitidos."})
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as error:
        return response(400, {"message": str(error)})
    except Exception:
        logger.exception("Error procesando la planeación financiera")
        return response(500, {"message": "Error interno. Revisa CloudWatch Logs."})
