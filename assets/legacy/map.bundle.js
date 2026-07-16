(() => {
  // <stdin>
  (() => {
    const e = React.createElement;
    const STORAGE_KEY = "lango.systemUnlockedLocations";
    const soundEffects = Object.freeze({
      next: { src: "/assets/sfx/ui-next.mp3", volume: 0.68 },
      back: { src: "/assets/sfx/ui-back.mp3", volume: 0.68 },
      unlocked: { src: "/assets/sfx/power-up.mp3", volume: 0.78 },
      locked: { src: "/assets/sfx/weakness.mp3", volume: 0.72 }
    });
    const activeSounds = /* @__PURE__ */ new Set();
    const playSound = (name) => {
      const effect = soundEffects[name];
      if (!effect) return;
      const audio = new Audio(effect.src);
      audio.preload = "auto";
      audio.volume = effect.volume;
      activeSounds.add(audio);
      const cleanup = () => activeSounds.delete(audio);
      audio.addEventListener("ended", cleanup, { once: true });
      audio.play().catch((error) => {
        console.warn('[map sfx] Could not play "'.concat(name, '"'), error);
        cleanup();
      });
    };
    const locations = [
      { id: "home", label: "Home", image: "location-home.png", unlocked: true },
      { id: "school", label: "School", image: "location-school.png" },
      { id: "mall", label: "Shopping Mall", image: "location-shopping-mall.png" },
      { id: "park", label: "Park", image: "location-park.png" },
      { id: "beach", label: "Beach", image: "location-beach.png" }
    ];
    const loadUnlocked = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return /* @__PURE__ */ new Set(["home", ...saved]);
      } catch (e2) {
        return /* @__PURE__ */ new Set(["home"]);
      }
    };
    function LockedDialog({ location, onClose }) {
      React.useEffect(() => {
        const onKeyDown = (event) => event.key === "Escape" && onClose();
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
      }, [onClose]);
      return e(
        "div",
        {
          className: "unlock-backdrop",
          onMouseDown: (event) => event.target === event.currentTarget && onClose()
        },
        e(
          "section",
          {
            className: "unlock-card",
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": "locked-title"
          },
          e("h1", { id: "locked-title" }, "".concat(location.label, " is locked")),
          e("p", null, "Keep learning to unlock this location."),
          e(
            "div",
            { className: "unlock-actions" },
            e("button", { type: "button", className: "unlock-cancel", autoFocus: true, onClick: onClose }, "Got it")
          )
        )
      );
    }
    function MapPage() {
      const [unlocked] = React.useState(loadUnlocked);
      const [lockedNotice, setLockedNotice] = React.useState(null);
      const [toast, setToast] = React.useState("");
      const toastTimer = React.useRef(null);
      React.useEffect(() => () => clearTimeout(toastTimer.current), []);
      const announce = (message) => {
        setToast(message);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(""), 1800);
      };
      const chooseLocation = (location) => {
        if (!unlocked.has(location.id)) {
          playSound("locked");
          setLockedNotice(location);
          return;
        }
        playSound("unlocked");
        announce("".concat(location.label, " is unlocked!"));
      };
      const closeLockedNotice = () => {
        playSound("back");
        setLockedNotice(null);
      };
      const leaveMap = () => {
        playSound("back");
        const destination = returnToRewards ? "/?openRewards=1" : "/";
        setTimeout(() => {
          if (window.LangoPageTransition && window.LangoPageTransition.navigate) {
            window.LangoPageTransition.navigate(destination);
          } else {
            window.location.href = destination;
          }
        }, 180);
      };
      const returnToRewards = new URLSearchParams(window.location.search).get("return") === "rewards";
      return e(
        "main",
        { className: "map-page" },
        e(
          "section",
          { className: "map-scene", "data-node-id": "799:32", "aria-label": "Lango location map" },
          e("img", { className: "map-background", src: "/assets/map/background.png", alt: "", draggable: false }),
          e("div", { className: "map-frame", "aria-hidden": true }),
          e("img", { className: "map-title", src: "/assets/map/side-panel.png", alt: "Map", draggable: false }),
          e(
            "button",
            { type: "button", className: "map-return", "aria-label": returnToRewards ? "Return to rewards" : "Return home", onClick: leaveMap },
            e("img", { src: "/assets/map/home-button.png", alt: "", draggable: false })
          ),
          ...locations.map((location) => e("button", {
            key: location.id,
            type: "button",
            className: "location-hotspot location-hotspot--".concat(location.id),
            "data-locked": String(!unlocked.has(location.id)),
            "aria-label": unlocked.has(location.id) ? "".concat(location.label, ", unlocked") : "".concat(location.label, ", locked"),
            onClick: () => chooseLocation(location)
          }, e("img", { src: "/assets/map/".concat(location.image), alt: "", draggable: false }))),
          toast && e("div", { className: "map-toast", role: "status" }, toast),
          lockedNotice && e(LockedDialog, { location: lockedNotice, onClose: closeLockedNotice })
        )
      );
    }
    ReactDOM.createRoot(document.getElementById("root")).render(e(MapPage));
  })();
})();
