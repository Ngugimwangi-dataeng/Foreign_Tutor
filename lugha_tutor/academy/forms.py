import base64
import binascii
import hashlib
import hmac

from django import forms
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import UserCreationForm
from django.db import connection

from .models import Lesson, LiveSession

User = get_user_model()


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


class StudentRegistrationForm(UserCreationForm):
    email = forms.EmailField(required=True)
    first_name = forms.CharField(max_length=150, required=False)
    last_name = forms.CharField(max_length=150, required=False)

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("username", "email", "first_name", "last_name")

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("An account with this email already exists.")
        return email

    def save(self, commit=True):
        user = super().save(commit=False)
        user.email = self.cleaned_data["email"]
        user.first_name = self.cleaned_data.get("first_name", "").strip()
        user.last_name = self.cleaned_data.get("last_name", "").strip()
        user.is_staff = False
        user.is_superuser = False
        if commit:
            user.save()
        return user


class LessonUploadForm(forms.ModelForm):
    class Meta:
        model = Lesson
        fields = [
            "course",
            "title",
            "order",
            "summary",
            "audio_file",
            "pdf_notes",
            "is_preview",
        ]


class LiveSessionForm(forms.ModelForm):
    class Meta:
        model = LiveSession
        fields = [
            "course",
            "title",
            "scheduled_at",
            "meeting_url",
            "is_live_now",
        ]
        widgets = {
            "scheduled_at": forms.DateTimeInput(attrs={"type": "datetime-local"}),
        }


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

        django_user = User.objects.filter(email__iexact=db_email).first()
        if django_user is None:
            base_username = db_email.split("@", 1)[0][:140]
            username = base_username
            suffix = 1
            while User.objects.filter(username=username).exists():
                username = f"{base_username}_{suffix}"
                suffix += 1
            name_parts = (full_name or "").strip().split(None, 1)
            django_user = User.objects.create_user(
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