import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { apiClient } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useStreakStore } from "../store/streakStore";
import { normalizeEmail, validateEmail, validatePassword } from "../types/validation";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const setAuth = useAuthStore((state) => state.setAuth);
  const registerLogin = useStreakStore((state) => state.registerLogin);
  const navigate = useNavigate();

  const authMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      if (mode === "signup") {
        return apiClient.signup(email, password);
      }
      return apiClient.login(email, password);
    },
    onSuccess: (response) => {
      setFormError(null);
      setAuth(response.token, response.userId, response.email);
      registerLogin(response.userId);
      toast.success(mode === "login" ? "Welcome back. You are logged in." : "Account created successfully.");
      navigate("/");
    },
    onError: () => {
      setFormError("Authentication could not be completed. Please check your input and try again.");
      toast.error(
        mode === "login"
          ? "Login failed. Please check your credentials and try again."
          : "Sign up failed. Please try again in a moment.",
        { id: "auth-error" }
      );
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();

    const normalizedEmail = normalizeEmail(email);
    const emailError = validateEmail(normalizedEmail);
    if (emailError) {
      setFormError(emailError);
      toast.error(emailError, { id: "auth-validation-email" });
      return;
    }

    const passwordError = validatePassword(password, mode);
    if (passwordError) {
      setFormError(passwordError);
      toast.error(passwordError, { id: "auth-validation-password" });
      return;
    }

    setFormError(null);
    authMutation.mutate({ email: normalizedEmail, password });
  };

  return (
    <div className="auth-layout">
      <section className="auth-showcase">
        <p className="auth-kicker">Smart Study Studio</p>
        <h1>Flash Card Engine</h1>
        <p className="auth-lead">
          Turn your PDF notes into adaptive revision sessions that feel clear, playful, and motivating.
        </p>

        <div className="auth-showcase-cards" role="list" aria-label="Platform highlights">
          <article className="auth-showcase-card" role="listitem">
            <h2>Generate</h2>
            <p>Create flashcards from notes with structured concept extraction.</p>
          </article>
          <article className="auth-showcase-card" role="listitem">
            <h2>Practice</h2>
            <p>Follow smart review cycles that adapt to your confidence level.</p>
          </article>
          <article className="auth-showcase-card" role="listitem">
            <h2>Progress</h2>
            <p>Track mastered, shaky, and upcoming cards in one clear dashboard.</p>
          </article>
        </div>
      </section>

      <section className="surface auth-form-panel">
        <h2>{mode === "login" ? "Welcome Back" : "Create Your Account"}</h2>
        <p className="auth-form-subtitle">
          {mode === "login"
            ? "Continue your streak and pick up where you left off."
            : "Start building mastery-driven decks in minutes."}
        </p>

        <div className="auth-mode-toggle" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={`auth-mode-button ${mode === "login" ? "active" : ""}`}
            onClick={() => {
              setMode("login");
              setFormError(null);
            }}
            role="tab"
            aria-selected={mode === "login"}
          >
            Login
          </button>
          <button
            type="button"
            className={`auth-mode-button ${mode === "signup" ? "active" : ""}`}
            onClick={() => {
              setMode("signup");
              setFormError(null);
            }}
            role="tab"
            aria-selected={mode === "signup"}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={submit} className="grid auth-form-grid">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={320}
            autoComplete="email"
            spellCheck={false}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            maxLength={128}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          <button className="button-main auth-submit" type="submit" disabled={authMutation.isPending}>
            {authMutation.isPending ? "Please wait..." : mode === "login" ? "Login" : "Create account"}
          </button>
        </form>

        {formError && <p className="auth-error">{formError}</p>}

        <p className="auth-footnote">
          Your account keeps deck progress, review history, and concept analytics in sync.
        </p>
      </section>
    </div>
  );
}
