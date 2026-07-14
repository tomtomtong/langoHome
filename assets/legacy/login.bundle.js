(() => {
  // <stdin>
  var form = document.getElementById("login-form");
  var errorEl = document.getElementById("error");
  var submitBtn = document.getElementById("submit-btn");
  var nextUrl = new URLSearchParams(location.search).get("next") || "/";
  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.add("visible");
  }
  function clearError() {
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in\u2026";
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: document.getElementById("username").value.trim(),
          password: document.getElementById("password").value
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.error || "Login failed. Please try again.");
        return;
      }
      location.href = nextUrl.startsWith("/") ? nextUrl : "/";
    } catch (err) {
      showError("Could not reach the server. Please try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign in";
    }
  });
})();
