import os
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from academy.models import Course, Enrollment, Lesson, LiveSession


class Command(BaseCommand):
    help = "Seeds LughaSmart with demo Tutor/Student accounts, 6 Kenyan language courses, lessons, and live sessions."

    def handle(self, *args, **options):
        User = get_user_model()

        tutor_username = os.getenv("SEED_TUTOR_USERNAME", "").strip()
        tutor_password = os.getenv("SEED_TUTOR_PASSWORD", "")
        tutor_email = os.getenv("SEED_TUTOR_EMAIL", "").strip()
        student_username = os.getenv("SEED_STUDENT_USERNAME", "").strip()
        student_password = os.getenv("SEED_STUDENT_PASSWORD", "")
        student_email = os.getenv("SEED_STUDENT_EMAIL", "").strip()

        tutor = None
        if tutor_username and tutor_password and tutor_email:
            tutor, _ = User.objects.get_or_create(
                username=tutor_username,
                defaults={"email": tutor_email, "is_staff": True, "is_superuser": False},
            )
            tutor.email = tutor_email
            tutor.is_staff = True
            tutor.set_password(tutor_password)
            tutor.save()

        student = None
        if student_username and student_password and student_email:
            student, _ = User.objects.get_or_create(
                username=student_username,
                defaults={"email": student_email, "is_staff": False, "is_superuser": False},
            )
            student.email = student_email
            student.is_staff = False
            student.set_password(student_password)
            student.save()

        if tutor is None:
            tutor = User.objects.filter(is_staff=True).first()

        if tutor is None:
            self.stdout.write(
                self.style.WARNING("No staff tutor account exists; configure SEED_TUTOR_* variables before seeding courses.")
            )
            return

        seed_courses = [
            {
                "slug": "conversational-kiswahili",
                "title": "Conversational Kiswahili for Foreigners & Expats",
                "language_name": "Swahili (Kiswahili)",
                "description": "Master everyday conversational Swahili, greetings, market bargaining, transport navigation, and cultural etiquette across Kenya.",
                "price_kes": Decimal("4500.00"),
                "level": "beginner",
            },
            {
                "slug": "gikuyu-heritage-business",
                "title": "Gĩkũyũ Indigenous Heritage & Business Dialect",
                "language_name": "Kikuyu (Gĩkũyũ)",
                "description": "Comprehensive oral mastery, tonal pronunciation guides, central Kenya commerce vocabulary, and native proverbs.",
                "price_kes": Decimal("5200.00"),
                "level": "beginner",
            },
            {
                "slug": "dholuo-lake-immersion",
                "title": "Dholuo Intensive: Lake Region Social Immersion",
                "language_name": "Luo (Dholuo)",
                "description": "Deep dive into Luo syntax, greeting rituals, conversational flow, and socio-cultural idioms for Western Kenya travelers.",
                "price_kes": Decimal("4800.00"),
                "level": "beginner",
            },
            {
                "slug": "maa-cultural-dialogue",
                "title": "Maa (Maasai) Cultural Dialogue & Community Relations",
                "language_name": "Maasai (Maa)",
                "description": "Specialized language program for conservationists, eco-tourists, and researchers working alongside Maasai communities.",
                "price_kes": Decimal("6000.00"),
                "level": "field_guide",
            },
            {
                "slug": "kalenjin-tonal-phonics",
                "title": "Kalenjin Tonal Phonics & Rift Valley Traditions",
                "language_name": "Kalenjin (Nandi/Kipsigis)",
                "description": "Explore the rhythmic tones and communal greetings of the Kalenjin languages spoken across Kenya's Rift Valley.",
                "price_kes": Decimal("4600.00"),
                "level": "beginner",
            },
            {
                "slug": "kikamba-express-trade",
                "title": "Kikamba Express: Eastern Kenya Trade Colloquialisms",
                "language_name": "Kamba (Kikamba)",
                "description": "Learn rapid trade colloquialisms, polite phrasing, and artisan communications for Machakos, Kitui, and Makueni.",
                "price_kes": Decimal("3800.00"),
                "level": "beginner",
            },
        ]

        first_course = None
        for idx, item in enumerate(seed_courses):
            course, _ = Course.objects.get_or_create(
                slug=item["slug"],
                defaults={**item, "tutor": tutor, "is_published": True},
            )
            if idx == 0:
                first_course = course

            Lesson.objects.get_or_create(
                course=course,
                order=1,
                defaults={
                    "title": f"Essential Greetings & Introductions in {course.language_name}",
                    "summary": "Core cultural greetings, polite replies, and pronunciation cadence.",
                    "duration_minutes": 35,
                },
            )
            Lesson.objects.get_or_create(
                course=course,
                order=2,
                defaults={
                    "title": "Market Bargaining, Directions & Daily Phrases",
                    "summary": "Practical dialogue drills for transport, markets, and social rapport.",
                    "duration_minutes": 40,
                },
            )

        if first_course is not None and student is not None and tutor is not None:
            Enrollment.objects.get_or_create(
                student=student,
                course=first_course,
                defaults={
                    "payment_status": Enrollment.STATUS_COMPLETED,
                    "paystack_reference": "DEMO-MPESA-QK8820",
                    "amount_paid_kes": first_course.price_kes,
                    "payment_channel": "mobile_money",
                    "is_ready_for_class": True,
                    "paid_at": timezone.now(),
                },
            )
            LiveSession.objects.get_or_create(
                course=first_course,
                title="Live Kiswahili Pronunciation & Q&A",
                defaults={
                    "platform": "jitsi",
                    "meeting_url": "https://meet.jit.si/LughaSmartKiswahiliLiveRoom",
                    "scheduled_at": timezone.now() + timedelta(hours=2),
                    "is_live_now": True,
                    "notes": "Bring your microphone for live coastal cadence coaching.",
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                "LughaSmart seeded."
            )
        )
