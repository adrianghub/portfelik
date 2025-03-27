import { signIn } from "@/lib/firebase/firebase";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { logger } from "@/lib/logger";
import { validateEmail, validatePassword } from "@/modules/login/validation";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { FirebaseError } from "firebase/app";
import { useState } from "react";

type LoginFormData = {
  email: string;
  password: string;
};

export function useLoginForm() {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const navigate = useNavigate();

  const getRedirectUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("redirect") || "/";
  };

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }: { value: LoginFormData }) => {
      setError(null);
      setLoading(true);

      try {
        await signIn(value.email, value.password);
        navigate({ to: getRedirectUrl() });
      } catch (err) {
        if (err instanceof FirebaseError) {
          const errorMessage =
            err.code === "auth/invalid-credential"
              ? t("login.error.invalidCredentials")
              : err.code === "auth/too-many-requests"
                ? t("login.error.tooManyAttempts")
                : err.code === "auth/network-request-failed"
                  ? t("login.error.offline")
                  : t("login.error.generic");
          setError(errorMessage);
        } else {
          setError(t("login.error.generic"));
        }
        logger.error(
          "Login error:",
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        setLoading(false);
      }
    },
  });

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setFieldValue("email", value);
    const emailError = validateEmail(value, t);
    setValidationErrors((prev) => ({ ...prev, email: emailError }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    form.setFieldValue("password", value);
    const passwordError = validatePassword(value, t);
    setValidationErrors((prev) => ({ ...prev, password: passwordError }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const emailError = validateEmail(form.getFieldValue("email"), t);
    const passwordError = validatePassword(form.getFieldValue("password"), t);

    setValidationErrors({
      email: emailError,
      password: passwordError,
    });

    if (!emailError && !passwordError) {
      form.handleSubmit();
    }
  };

  return {
    email: form.getFieldValue("email"),
    password: form.getFieldValue("password"),
    error,
    loading,
    validationErrors,
    handleEmailChange,
    handlePasswordChange,
    handleSubmit,
  };
}
