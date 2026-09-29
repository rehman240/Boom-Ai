from pydantic import BaseModel, EmailStr, Field, field_validator

PASSWORD = Field(min_length=8, max_length=128)


class WorkspaceUpdate(BaseModel):
    workspace_name: str = Field(max_length=120)

    @field_validator("workspace_name")
    @classmethod
    def clean(cls, v: str) -> str:
        name = " ".join(v.split())
        if not name:
            raise ValueError("Please enter a workspace name.")
        return name


class EmailChange(BaseModel):
    """Changing the sign-in address needs the password: a borrowed session is not enough."""

    email: EmailStr
    password: str = Field(max_length=128)

    @field_validator("email")
    @classmethod
    def lowercase(cls, v: str) -> str:
        return v.lower()


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = PASSWORD


class AccountDelete(BaseModel):
    password: str = Field(max_length=128)
