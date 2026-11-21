import base64
import binascii
import hashlib
import hmac

from django import forms
from django.contrib.auth import get_user_model
from django.db import connection


def _verify_shared_user_secret(raw_secret: str, stored_hash: str) -> bool:
    if not raw_secret or not stored_hash:
        return False
    try:
        parts = stored_hash.split("$")
        if parts[0] == "pbkdf2_sha256" and len(parts) == 4:
            _, iterations_text, encoded_salt, encoded_digest = parts
            iterations = int(iterations_text)
            if not 100_000 <= iterations <= 2_000_000:
                return False
            salt = base64.b64decode(encoded_salt, altchars=b"-_", validate=True)
            expected_digest = base64.b64decode(encoded_digest, altchars=b"-_", validate=True)
            actual_digest = hashlib.pbkdf2_hmac(
                "sha256", raw_secret.encode("utf-8"), salt, iterations
            )
            return hmac.compare_digest(actual_digest, expected_digest)

        if parts[0] == "scrypt" and len(parts) == 3:
            _, encoded_salt, encoded_digest = parts
            salt = base64.b64decode(encoded_salt, altchars=b"-_", validate=True)
            expected_digest = base64.b64decode(encoded_digest, altchars=b"-_", validate=True)
            actual_digest = hashlib.scrypt(
                raw_secret.encode("utf-8"),
                salt=salt,
                n=16384,
                r=8,
                p=1,
                dklen=len(expected_digest),
            )
            return hmac.compare_digest(actual_digest, expected_digest)
    except (ValueError, binascii.Error):
        return False
    return False


class TutorAdminSecretLoginForm(forms.Form):
    email = forms.EmailField(
        label="Admin Email",
        widget=forms.EmailInput(
            attrs={"autocomplete": "email", "placeholder": "amina.wambui@lughasmart.ac.ke"}
        ),
    )
    password = forms.CharField(
        label="Password",
        widget=forms.PasswordInput(
            attrs={"autocomplete": "current-password", "placeholder": "Enter password"}
        ),
    )
    secret_key = forms.CharField(
        label="Secret Key / Security PIN",
        widget=forms.PasswordInput(
            attrs={"autocomplete": "off", "placeholder": "Enter 6-digit Security PIN"}
        ),
    )

    def __init__(self, *args, **kwargs):
        self.user = None
        super().__init__(*args, **kwargs)

    def clean(self):
        cleaned_data = super().clean()
        email = (cleaned_data.get("email") or "").strip().lower()
        password = cleaned_data.get("password") or ""
        secret_key = (cleaned_data.get("secret_key") or "").strip()

        if not email or not password or not secret_key:
            return cleaned_data

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT full_name, email, password_hash, admin_pin_hash, role, is_admin, is_active
                FROM users
                WHERE LOWER(email) = %s AND role = 'tutor' AND is_admin = TRUE
                LIMIT 1
                """,
                [email],
            )
            row = cursor.fetchone()

        if not row:
            raise forms.ValidationError("Invalid email, password, or secret key.")

        full_name, db_email, password_hash, admin_pin_hash, _role, _is_admin, is_active = row
        if not is_active:
            raise forms.ValidationError("This tutor/admin account is inactive.")

        if not (
            _verify_shared_user_secret(password, password_hash)
            and _verify_shared_user_secret(secret_key, admin_pin_hash or "")
        ):
            raise forms.ValidationError("Invalid email, password, or secret key.")

        UserModel = get_user_model()
        django_user = UserModel.objects.filter(email__iexact=db_email).first()
        if django_user is None:
            base_username = db_email.split("@", 1)[0][:140]
            username = base_username
            suffix = 1
            while UserModel.objects.filter(username=username).exists():
                username = f"{base_username}_{suffix}"
                suffix += 1
            name_parts = (full_name or "").strip().split(None, 1)
            django_user = UserModel.objects.create_user(
                username=username,
                email=db_email,
                password=password,
                first_name=name_parts[0] if name_parts else "",
                last_name=name_parts[1] if len(name_parts) > 1 else "",
                is_staff=True,
                is_superuser=True,
            )
        else:
            updates = []
            if not django_user.is_staff:
                django_user.is_staff = True
                updates.append("is_staff")
            if not django_user.is_superuser:
                django_user.is_superuser = True
                updates.append("is_superuser")
            if updates:
                django_user.save(update_fields=updates)

        self.user = django_user
        return cleaned_data