"""Sending email, through any SMTP server (Gmail, Brevo, Resend, AWS SES, ...).

Settings come from SMTP_* environment variables. Without SMTP_HOST no email is sent: in
development the message is written to the log instead, so the reset link can still be used;
in production only a warning is logged, never the message, because it holds a private link.
"""

import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Protocol

from app.config import get_settings

log = logging.getLogger(__name__)


class Mailer(Protocol):
    def send(self, to: str, subject: str, text: str) -> None: ...


class SmtpMailer:
    def send(self, to: str, subject: str, text: str) -> None:
        s = get_settings()
        msg = EmailMessage()
        msg["From"] = s.mail_from
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(text)
        context = ssl.create_default_context()
        try:
            if s.smtp_port == 465:  # implicit TLS
                with smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, context=context, timeout=20) as server:
                    self._deliver(server, msg)
            else:  # 587 and others: STARTTLS
                with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=20) as server:
                    server.starttls(context=context)
                    self._deliver(server, msg)
        except (smtplib.SMTPException, OSError) as e:
            # Logged without the address or the message, which hold private details.
            log.error("Email could not be sent: %s", type(e).__name__)

    @staticmethod
    def _deliver(server: smtplib.SMTP, msg: EmailMessage) -> None:
        s = get_settings()
        if s.smtp_user:
            server.login(s.smtp_user, s.smtp_password)
        server.send_message(msg)


class LogMailer:
    """No SMTP server set up: show the message in development, refuse quietly in production."""

    def send(self, to: str, subject: str, text: str) -> None:
        if get_settings().is_production:
            log.warning("Email not sent: SMTP_HOST is not set.")
        else:
            log.info("Email (not sent, SMTP_HOST is not set) to %s: %s\n%s", to, subject, text)


def get_mailer() -> Mailer:
    return SmtpMailer() if get_settings().smtp_host else LogMailer()
