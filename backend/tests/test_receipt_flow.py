import importlib
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from uuid import uuid4

SOURCE_DIR = Path(__file__).resolve().parents[1] / "src" / "transactions"
sys.path.insert(0, str(SOURCE_DIR))
os.environ.setdefault("AWS_ACCESS_KEY_ID", "test-access-key")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test-secret-key")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("RECEIPTS_BUCKET_NAME", "test-receipts-bucket")
os.environ.setdefault("TABLE_NAME", "test-transactions-table")

import receipt_service

handler_module = importlib.import_module("handler")


def api_event(route_key, method, body=None, user_id="user-test-1", path_parameters=None):
    return {
        "routeKey": route_key,
        "body": json.dumps(body or {}),
        "requestContext": {
            "authorizer": {"jwt": {"claims": {"sub": user_id}}},
            "http": {"method": method},
        },
        "pathParameters": path_parameters or {},
    }


class ReceiptServiceTests(unittest.TestCase):
    def test_normalizes_mexican_receipt_amounts(self):
        self.assertEqual(receipt_service.normalize_amount("$1,234.50 MXN"), "1234.50")
        self.assertEqual(receipt_service.normalize_amount("1.234,50"), "1234.50")
        self.assertIsNone(receipt_service.normalize_amount("sin total"))

    def test_upload_url_is_scoped_to_user_and_limited(self):
        signed_post = {"url": "https://s3.example/upload", "fields": {"key": "receipt"}}
        with patch.object(receipt_service.s3, "generate_presigned_post", return_value=signed_post) as create_post:
            result = receipt_service.create_upload("user-42", {"contentType": "image/jpeg"})

        self.assertEqual(result["uploadUrl"], signed_post["url"])
        self.assertEqual(result["expiresInSeconds"], 300)
        args = create_post.call_args.kwargs
        self.assertTrue(args["Key"].startswith("receipts/user-42/"))
        self.assertIn(["content-length-range", 1, 10 * 1024 * 1024], args["Conditions"])

    def test_analyze_expense_returns_fields_for_manual_review(self):
        receipt_id = str(uuid4())
        response = {
            "ExpenseDocuments": [{
                "SummaryFields": [
                    {"Type": {"Text": "TOTAL"}, "ValueDetection": {"Text": "$249.50", "Confidence": 98.5, "Currency": {"Code": "MXN"}}},
                    {"Type": {"Text": "VENDOR_NAME"}, "ValueDetection": {"Text": "Tienda de prueba", "Confidence": 97}},
                    {"Type": {"Text": "INVOICE_RECEIPT_DATE"}, "ValueDetection": {"Text": "2026-11-20", "Confidence": 95}},
                ],
                "LineItemGroups": [],
            }]
        }
        with patch.object(receipt_service, "head_receipt", return_value=("receipts/u/id", {"ContentLength": 900})), patch.object(
            receipt_service.textract, "analyze_expense", return_value=response
        ):
            result = receipt_service.analyze_receipt("user-42", receipt_id)

        self.assertEqual(result["draft"]["amount"], "249.50")
        self.assertEqual(result["draft"]["merchant"], "Tienda de prueba")
        self.assertEqual(result["draft"]["date"], "2026-11-20")
        self.assertEqual(result["draft"]["currency"], "MXN")

    def test_rejects_unsupported_upload_type(self):
        with self.assertRaises(receipt_service.ReceiptServiceError) as error:
            receipt_service.create_upload("user-42", {"contentType": "text/plain"})
        self.assertEqual(error.exception.status_code, 400)


class ReceiptApiFlowTests(unittest.TestCase):
    def setUp(self):
        self.table = MagicMock()
        self.table.put_item.return_value = {}
        self.original_table = handler_module.table
        handler_module.table = self.table

    def tearDown(self):
        handler_module.table = self.original_table

    def test_upload_analyze_and_save_receipt_on_expense(self):
        receipt_id = str(uuid4())
        with patch.object(handler_module, "create_upload", return_value={"receiptId": receipt_id, "uploadUrl": "https://s3.example/upload"}), patch.object(
            handler_module, "analyze_receipt", return_value={"receiptId": receipt_id, "draft": {"amount": "249.50"}}
        ), patch.object(handler_module, "ensure_receipt_exists") as check_owner:
            upload = handler_module.handler(api_event("POST /receipts/upload-url", "POST", {"contentType": "image/jpeg"}), None)
            analyzed = handler_module.handler(api_event("POST /receipts/analyze", "POST", {"receiptId": receipt_id}), None)
            saved = handler_module.handler(api_event(
                "POST /transactions",
                "POST",
                {"amount": "249.50", "category": "otros", "description": "Tienda de prueba", "date": "2026-11-20", "receiptId": receipt_id},
            ), None)

        self.assertEqual(upload["statusCode"], 200)
        self.assertEqual(json.loads(analyzed["body"])["draft"]["amount"], "249.50")
        self.assertEqual(saved["statusCode"], 201)
        self.assertEqual(self.table.put_item.call_args.kwargs["Item"]["receiptId"], receipt_id)
        check_owner.assert_called_once_with("user-test-1", receipt_id)

    def test_receipt_routes_require_a_validated_cognito_user(self):
        event = api_event("POST /receipts/upload-url", "POST", {"contentType": "image/jpeg"}, user_id="")
        result = handler_module.handler(event, None)
        self.assertEqual(result["statusCode"], 401)


if __name__ == "__main__":
    unittest.main()
