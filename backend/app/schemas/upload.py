import uuid
from datetime import datetime

from pydantic import BaseModel


class UploadOut(BaseModel):
    id: uuid.UUID
    kind: str
    original_filename: str
    content_type: str
    size_bytes: int
    created_at: datetime

    # storage_key is deliberately absent: where the file sits is the server's business.
    model_config = {"from_attributes": True}
