import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    workspace_name: str | None = Field(default=None, max_length=120)

    @field_validator("email")
    @classmethod
    def lowercase(cls, v: str) -> str:
        return v.lower()


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)

    @field_validator("email")
    @classmethod
    def lowercase(cls, v: str) -> str:
        return v.lower()


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    workspace_name: str

    model_config = {"from_attributes": True}
