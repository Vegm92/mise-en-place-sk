import anthropic
import json

from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

client = anthropic.Anthropic()

_api_retry = retry(
    retry=retry_if_exception_type((anthropic.APIStatusError, anthropic.APIConnectionError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(min=1, max=10),
    reraise=True,
)

EXTRACTION_PROMPT = """You are an invoice data extraction specialist. Extract all relevant information from this invoice and return it as a JSON object.

Return ONLY valid JSON with this exact structure:
{
  "supplier_name": "string",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "total_amount": number or null,
  "line_items": [
    {
      "description": "string",
      "quantity": number or null,
      "unit": "string or null",
      "unit_price": number or null,
      "total_price": number or null
    }
  ],
  "confidence": 0.0 to 1.0
}

The confidence score should reflect how certain you are about the extracted data:
- 0.85+ : All key fields clearly visible and readable
- 0.60-0.84 : Most fields readable, some ambiguity
- below 0.60 : Poor quality, missing critical fields"""


def _parse_response(response) -> dict:
    """Extract and parse JSON from a Claude response."""
    text_block = next(b for b in response.content if b.type == "text")
    raw = text_block.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()
    return json.loads(raw)


@_api_retry
def call_with_text(text: str) -> dict:
    """Send text invoice content to Claude. Returns extracted data dict."""
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        thinking={"type": "adaptive"},
        messages=[{
            "role": "user",
            "content": f"{EXTRACTION_PROMPT}\n\nINVOICE TEXT:\n{text}",
        }],
    )
    return _parse_response(response)


@_api_retry
def call_with_images_multi(images: list[tuple[str, str]]) -> dict:
    """Send multiple images (base64_data, media_type) to Claude in one call."""
    content = []
    for image_data, media_type in images:
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": image_data},
        })
    content.append({"type": "text", "text": EXTRACTION_PROMPT})
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        thinking={"type": "adaptive"},
        messages=[{"role": "user", "content": content}],
    )
    return _parse_response(response)


@_api_retry
def call_with_image(image_data: str, media_type: str) -> dict:
    """Send image invoice content to Claude. Returns extracted data dict."""
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=2048,
        thinking={"type": "adaptive"},
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_data,
                    },
                },
                {"type": "text", "text": EXTRACTION_PROMPT},
            ],
        }],
    )
    return _parse_response(response)
