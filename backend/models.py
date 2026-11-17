from pydantic import BaseModel, Field, ConfigDict
from typing import Literal


class Account(BaseModel):
    email: str = Field(min_length=5, max_length=180)
    password: str = Field(min_length=10, max_length=128)
    name: str = Field(default='Organizador', min_length=2, max_length=80)


class Zone(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=60)
    capacity: int = Field(ge=1, le=1000000)
    price: float = Field(gt=0, le=100000, allow_inf_nan=False)


class EventFields(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(default='', max_length=140)
    category: str = Field(default='Concierto', max_length=60)
    date: str = Field(default='', max_length=10)
    time: str = Field(default='', max_length=5)
    timezone: str = Field(default='America/Lima', max_length=60)
    venue: str = Field(default='', max_length=150)
    city: str = Field(default='', max_length=80)
    description: str = Field(default='', max_length=5000)
    capacity: int = Field(default=0, ge=0, le=1000000)
    zones: list[Zone] = Field(default_factory=list, max_length=5)
    theme: Literal['violet', 'peach', 'forest', 'midnight'] = 'violet'


class UpdateEvent(EventFields):
    version: int = Field(ge=1)


class VersionRequest(BaseModel):
    version: int = Field(ge=1)


class FileRequest(BaseModel):
    eventId: str
    filename: str = Field(max_length=160)
    size: int = Field(gt=0, le=5242880)


class ImportRequest(BaseModel):
    eventId: str
    version: int = Field(ge=1)
    fileId: str



class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    message: str = Field(min_length=2, max_length=1000)
