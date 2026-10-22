// Sign-up forms, the step that follows the scroll, and the controller that lights up with its legend.

for (const form of document.querySelectorAll("[data-signup]")) {
  const input = form.querySelector('input[type="email"]');
  const button = form.querySelector("button");
  const label = button.querySelector(".label");
  const msg = form.querySelector(".signup-msg");
  const set = (state, text) => {
    form.dataset.state = state;
    msg.textContent = text;
    input.setAttribute("aria-invalid", String(state === "error"));
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      set("error", "Confira o e-mail: algo como voce@exemplo.com.");
      input.focus();
      return;
    }
    set("loading", "");
    button.disabled = true;
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website: form.querySelector(".hp").value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não deu para enviar. Tente de novo.");
      set("success", data.already ? "Você já está na lista. Até logo!" : "Pronto! Você está na lista do beta.");
      label.textContent = "Inscrito";
      input.value = "";
    } catch (error) {
      set("error", error.message === "Failed to fetch" ? "Sem conexão. Tente de novo." : error.message);
      button.disabled = false;
    }
  });
  input.addEventListener("input", () => {
    if (form.dataset.state === "error") set("", "");
  });
}

// Feature Stack: the step whose screenshot is in the middle of the screen is the one lit on the left.
const steps = [...document.querySelectorAll(".how-steps li")];
const shots = [...document.querySelectorAll(".how-shots figure")];
if (steps.length && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const index = entry.target.dataset.shot;
      steps.forEach((step) => step.classList.toggle("is-active", step.dataset.step === index));
    }
  }, { rootMargin: "-45% 0px -45% 0px" });
  shots.forEach((shot) => observer.observe(shot));
}

// Browsers without scroll-driven animations get the same reveal once, on entering the view.
if (!CSS.supports("animation-timeline: view()") && "IntersectionObserver" in window) {
  const reveal = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) { entry.target.classList.add("is-in"); reveal.unobserve(entry.target); }
    }
  }, { threshold: 0.2 });
  document.querySelectorAll(".reveal-scroll").forEach((el) => reveal.observe(el));
}

// The controller: pointing at a line of the legend lights its button, and the buttons light one by one on their own
// until the visitor points at something.
const legend = [...document.querySelectorAll(".pad-legend li")];
const light = (name) => {
  document.querySelectorAll(".pad [data-pad]").forEach((el) => el.classList.toggle("is-lit", el.dataset.pad === name));
  legend.forEach((li) => li.classList.toggle("is-lit", li.dataset.pad === name));
};
let touring = 0;
let tour;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad = document.querySelector(".pad");
if (pad && legend.length && !reduced && "IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => {
    clearInterval(tour);
    if (!entry.isIntersecting) return light("");
    tour = setInterval(() => light(legend[touring++ % legend.length].dataset.pad), 1400);
  }, { threshold: 0.4 }).observe(pad);
}
legend.forEach((li) => {
  li.addEventListener("pointerenter", () => { clearInterval(tour); light(li.dataset.pad); });
  li.addEventListener("pointerleave", () => light(""));
});
