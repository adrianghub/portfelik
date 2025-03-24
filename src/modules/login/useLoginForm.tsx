import { signIn } from "@/lib/firebase/firebase";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { validateEmail, validatePassword } from "@/modules/login/validation";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export function useLoginForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    onSubmit: async ({ value }) => {
      setError(null);
      setLoading(true);

      try {
        await signIn(value.email, value.password);
        navigate({ to: getRedirectUrl() });
      } catch (err) {
        setError(t("login.error"));
        console.error("Login error:", err);
      } finally {
        setLoading(false);
      }
    },
  });

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    form.setFieldValue("email", value);

    const emailError = validateEmail(value, t);
    setValidationErrors((prev) => ({
      ...prev,
      email: emailError,
    }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    form.setFieldValue("password", value);

    const passwordError = validatePassword(value, t);
    setValidationErrors((prev) => ({
      ...prev,
      password: passwordError,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const emailError = validateEmail(email, t);
    const passwordError = validatePassword(password, t);

    setValidationErrors({
      email: emailError,
      password: passwordError,
    });

    if (!emailError && !passwordError) {
      form.handleSubmit();
    }
  };

  return {
    email,
    password,
    error,
    loading,
    validationErrors,
    handleEmailChange,
    handlePasswordChange,
    handleSubmit,
  };
}
