import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../api/client";
import { useAuthStore } from "../store/authStore";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const setAuth = useAuthStore((state) => state.setAuth);
  const navigate = useNavigate();

  const authMutation = useMutation({
    mutationFn: async () => {
      if (mode === "signup") {
        return apiClient.signup(email, password);
      }
      return apiClient.login(email, password);
    },
    onSuccess: (response) => {
      setAuth(response.token, response.userId, response.email);
      navigate("/");
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    authMutation.mutate();
  };

  return (
    <section className="surface" style={{ maxWidth: 460, margin: "2rem auto" }}>
      <h1>{mode === "login" ? "Welcome Back" : "Create Account"}</h1>
      <p>
        {mode === "login"
          ? "Continue your spaced-repetition streak."
          : "Start building mastery-driven decks from PDFs."}
      </p>

      <form onSubmit={submit} className="grid">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
        />

        <button className="button-main" type="submit" disabled={authMutation.isPending}>
          {authMutation.isPending ? "Please wait..." : mode === "login" ? "Login" : "Sign up"}
        </button>
      </form>

      {authMutation.isError && (
        <p style={{ color: "#b91c1c", marginTop: "0.9rem" }}>
          {(authMutation.error as Error).message}
        </p>
      )}

      <div className="row" style={{ marginTop: "1rem" }}>
        <button
          className="button-alt"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          type="button"
        >
          {mode === "login" ? "Need an account? Sign up" : "Already registered? Login"}
        </button>
      </div>
    </section>
  );
}
