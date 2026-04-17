"""
Extraction microservice — standalone FastAPI app.
Run with: uvicorn extraction_service:app --port 8001 --reload

POST /extract
  Request : multipart/form-data, field name "files", one or more invoice files
  Response 200:
    {
      "valid": true,
      "errors": [],
      "data": {
        "supplier_name": "string | null",
        "invoice_number": "string | null",
        "invoice_date":   "YYYY-MM-DD | null",
        "due_date":       "YYYY-MM-DD | null",
        "total_amount":   number | null,
        "confidence":     number (0.0–1.0),
        "line_items": [
          {
            "description": "string",
            "quantity":    number | null,
            "unit":        "string | null",
            "unit_price":  number | null,
            "total_price": number | null
          }
        ]
      }
    }
  Response 422 (validation failure or pipeline error):
    {
      "valid":  false,
      "errors": ["..."],   -- structural errors from the pipeline validator
      "error":  "..."      -- present only when an exception was raised
    }

No database is touched. No files are persisted beyond the request lifetime.
Temp files are always cleaned up, even on error.
"""

import shutil
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from services.invoice_pipeline import run_group

app = FastAPI(title="Mise en Place — Extraction Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # SvelteKit default
        "http://localhost:5173",   # Vite dev server
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["POST"],
    allow_headers=["*"],
)


@app.post("/extract")
async def extract(files: list[UploadFile] = File(...)):
    tmp_dir = Path(tempfile.mkdtemp())
    try:
        # Write uploaded files to temp directory
        saved: list[Path] = []
        for upload in files:
            dest = tmp_dir / (upload.filename or "invoice")
            with dest.open("wb") as f:
                content = await upload.read()
                f.write(content)
            saved.append(dest)

        if not saved:
            raise HTTPException(status_code=422, detail={"valid": False, "errors": ["No files received"], "data": {}})

        try:
            data, validation = run_group(saved)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail={"valid": False, "errors": [], "error": str(exc)},
            )

        if not validation.valid:
            raise HTTPException(
                status_code=422,
                detail={"valid": False, "errors": validation.errors, "data": data},
            )

        return {"valid": True, "errors": [], "data": data}

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
