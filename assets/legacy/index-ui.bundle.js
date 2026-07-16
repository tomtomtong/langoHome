(() => {
  // <stdin>
  window.LangoSfx = (() => {
    const sounds = Object.freeze({
      next: { src: "/assets/sfx/ui-next.mp3", volume: 0.38 },
      back: { src: "/assets/sfx/ui-back.mp3", volume: 0.38 },
      start: { src: "/assets/sfx/game-start.mp3", volume: 0.52 },
      loginSuccess: { src: "/assets/sfx/login-success.mp3", volume: 0.42 },
      loginFail: { src: "/assets/sfx/login-fail.mp3", volume: 0.32 },
      powerUp: { src: "/assets/sfx/power-up.mp3", volume: 0.58 },
      victory: { src: "/assets/sfx/victory.mp3", volume: 0.52 },
      weakness: { src: "/assets/sfx/weakness.mp3", volume: 0.3 }
    });
    const active = /* @__PURE__ */ new Set();
    let primed = false;
    function cleanup(entry) {
      entry.audio.removeEventListener("ended", entry.onEnded);
      active.delete(entry);
    }
    function play(name, { volume = 1, interrupt = false } = {}) {
      const sound = sounds[name];
      if (!sound) return null;
      if (interrupt) stop(name);
      const audio = new Audio(sound.src);
      audio.preload = "auto";
      audio.volume = Math.max(0, Math.min(1, sound.volume * volume));
      const entry = { name, audio, onEnded: null };
      entry.onEnded = () => cleanup(entry);
      audio.addEventListener("ended", entry.onEnded, { once: true });
      active.add(entry);
      audio.play().catch((error) => {
        console.warn('[sfx] Could not play "'.concat(name, '"'), error);
        cleanup(entry);
      });
      return audio;
    }
    function stop(name) {
      for (const entry of [...active]) {
        if (name && entry.name !== name) continue;
        entry.audio.pause();
        entry.audio.currentTime = 0;
        cleanup(entry);
      }
    }
    function prime() {
      if (primed) return;
      primed = true;
      Object.values(sounds).forEach(({ src }) => {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = src;
        audio.load();
      });
    }
    window.addEventListener("pointerdown", prime, { once: true, passive: true });
    window.addEventListener("keydown", prime, { once: true, passive: true });
    window.addEventListener("pagehide", () => stop());
    return { play, stop, prime };
  })();
  (() => {
    const e = React.createElement;
    const asset = (name) => "/assets/lango-home/".concat(name, ".png");
    const ROOM_SCENE_LABELS = Object.freeze({
      livingroom: "Living room",
      classroom: "Classroom",
      library: "Library",
      bedroom: "Bedroom",
      garden: "Garden",
      kitchen: "Kitchen",
      washroom: "Washroom"
    });
    function ImageButton({ className, image, label, onClick, sfx = "next" }) {
      return e("button", {
        type: "button",
        className: "lango-home__button ".concat(className),
        "aria-label": label,
        onClick: (event) => {
          var _a;
          (_a = window.LangoSfx) == null ? void 0 : _a.play(sfx);
          onClick == null ? void 0 : onClick(event);
        }
      }, e("img", { src: asset(image), alt: "", draggable: false }));
    }
    const FUN_TRANSITIONS = Object.freeze({
      map: { icon: "\u{1F5FA}\uFE0F", title: "Adventure time!", sub: "Off we go!" },
      reward: { icon: "\u{1F381}", title: "Surprise!", sub: "Your rewards are here!" },
      collection: { icon: "\u{1F9F8}", title: "My collection!", sub: "Meet your little friends!" },
      game: { icon: "\u{1F3AE}", title: "Game time!", sub: "Ready, set, play!" }
    });
    function FunTransition({ kind, leaving = false }) {
      const content = FUN_TRANSITIONS[kind];
      if (!content) return null;
      const sparks = [
        ["10%", "16%", "0ms", "\u2605"],
        ["82%", "12%", "90ms", "\u2726"],
        ["6%", "70%", "160ms", "\u25CF"],
        ["88%", "68%", "220ms", "\u2605"],
        ["22%", "84%", "280ms", "\u2726"],
        ["73%", "85%", "120ms", "\u25CF"]
      ];
      return e(
        "section",
        {
          className: "lango-fun-transition".concat(leaving ? " is-leaving" : ""),
          "data-kind": kind,
          role: "status",
          "aria-live": "polite",
          "aria-label": "".concat(content.title, " ").concat(content.sub)
        },
        e("div", { className: "lango-fun-transition__rays", "aria-hidden": "true" }),
        ...sparks.map(([x, y, delay, symbol], index) => e("span", {
          key: index,
          className: "lango-fun-transition__spark",
          style: { "--spark-x": x, "--spark-y": y, "--spark-delay": delay },
          "aria-hidden": "true"
        }, symbol)),
        e(
          "div",
          { className: "lango-fun-transition__card" },
          e("span", { className: "lango-fun-transition__icon", "aria-hidden": "true" }, content.icon),
          e("h2", { className: "lango-fun-transition__title" }, content.title),
          e("p", { className: "lango-fun-transition__sub" }, content.sub)
        )
      );
    }
    function ComingSoonDialog({ feature, onClose }) {
      React.useEffect(() => {
        const onKeyDown = (event) => event.key === "Escape" && onClose();
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
      }, [onClose]);
      return e(
        "div",
        {
          className: "coming-soon-backdrop",
          onMouseDown: (event) => event.target === event.currentTarget && onClose()
        },
        e(
          "section",
          {
            className: "coming-soon-card",
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": "coming-soon-title"
          },
          e("h2", { id: "coming-soon-title" }, "".concat(feature, " is coming soon")),
          e("p", null, "We are working on it. Please check back soon!"),
          e("button", { type: "button", autoFocus: true, onClick: onClose }, "Got it")
        )
      );
    }
    function DailyRewards() {
      const rewardAsset = (name) => "/assets/daily-rewards/".concat(name, ".png?v=20260713e");
      return e(
        "div",
        {
          id: "daily-rewards-overlay",
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": "daily-rewards-title",
          "aria-hidden": "true"
        },
        e(
          "section",
          {
            className: "daily-rewards-scene",
            "data-node-id": "601:415",
            "aria-label": "Daily rewards"
          },
          e("div", { className: "daily-rewards-celebrate", id: "daily-rewards-celebrate", "aria-hidden": "true" }),
          e("img", { className: "daily-rewards-gifts", src: rewardAsset("character"), alt: "", draggable: false }),
          e("img", { className: "daily-rewards-character", src: rewardAsset("gifts"), alt: "", draggable: false }),
          e(
            "button",
            {
              type: "button",
              className: "daily-rewards-return",
              id: "daily-rewards-close",
              "aria-label": "Return home",
              onClick: () => {
                var _a;
                return (_a = window.LangoSfx) == null ? void 0 : _a.play("back");
              }
            },
            e("img", { src: rewardAsset("return-button"), alt: "", draggable: false })
          ),
          e("img", { className: "daily-rewards-title-art", src: rewardAsset("quest-strip"), alt: "Reward", draggable: false }),
          e(
            "div",
            { className: "daily-rewards-board" },
            e("img", { className: "daily-rewards-board-art", src: rewardAsset("reward-board"), alt: "", draggable: false }),
            e("h2", { id: "daily-rewards-title", className: "daily-rewards-meta" }, "Reward"),
            e("div", { className: "daily-rewards-slots", id: "daily-rewards-slots", "aria-label": "Upcoming rewards" }),
            e(
              "div",
              { className: "daily-rewards-scrollbar", id: "daily-rewards-scrollbar", "aria-hidden": "true" },
              e("span", { className: "daily-rewards-scrollbar-thumb", id: "daily-rewards-scrollbar-thumb" })
            ),
            e(
              "div",
              { className: "daily-rewards-track", id: "daily-rewards-track", "aria-hidden": "true" },
              e("div", { className: "daily-rewards-track-fill", id: "daily-rewards-track-fill" })
            ),
            e(
              "div",
              { className: "daily-rewards-actions" },
              e("button", { type: "button", id: "daily-rewards-claim-btn" }, "Get")
            )
          ),
          e(
            "div",
            { className: "daily-rewards-quest", "aria-hidden": "true" },
            e("img", { className: "daily-rewards-quest-art", src: rewardAsset("reward-title"), alt: "", draggable: false }),
            e("span", { className: "daily-rewards-task-progress" }, "1/1")
          ),
          e(
            "div",
            { className: "daily-reward-congrats", id: "daily-reward-congrats", hidden: true },
            e(
              "section",
              { className: "daily-reward-congrats-card", role: "dialog", "aria-modal": "true", "aria-labelledby": "daily-reward-congrats-banner", "data-node-id": "719:34" },
              e("h2", { className: "daily-reward-congrats-banner", id: "daily-reward-congrats-banner", "data-node-id": "723:161" }, "Congratulations!"),
              e("p", { className: "daily-reward-congrats-title", id: "daily-reward-congrats-title", "data-node-id": "719:75" }),
              e("div", { className: "daily-reward-congrats-icon", id: "daily-reward-congrats-icon", "data-node-id": "670:3076" }),
              e("p", { className: "daily-reward-congrats-name", id: "daily-reward-congrats-name" }),
              e(
                "button",
                { type: "button", id: "daily-reward-modal-cta", "data-node-id": "719:104" },
                e("img", { className: "daily-reward-modal-cta-art", src: rewardAsset("congrats-get-button"), alt: "", draggable: false }),
                e("span", { className: "daily-reward-modal-cta-label", id: "daily-reward-modal-cta-label" }, "Get")
              )
            )
          ),
          e(
            "div",
            { className: "daily-rewards-meta", "aria-live": "polite" },
            e("span", { id: "daily-rewards-streak-text" }, "Streak: 0 days"),
            e("span", { id: "daily-rewards-stars-text" }, "0 stars")
          )
        )
      );
    }
    const COLLECTION_DOLLS = [
      { rowHeight: 188, size: 188, left: 0, lockTop: 70 },
      { rowHeight: 164, size: 142, left: 23, lockTop: 47 },
      { rowHeight: 164, size: 150, left: 19, lockTop: 51 },
      { rowHeight: 177, size: 167, left: 11, lockTop: 64 },
      { rowHeight: 187, size: 172, left: 8, lockTop: 74 },
      { rowHeight: 177, size: 163, left: 13, lockTop: 57 }
    ];
    function Collection() {
      const [visible, setVisible] = React.useState(false);
      const [unlocked, setUnlocked] = React.useState(false);
      const [scrollProgress, setScrollProgress] = React.useState(0);
      const listRef = React.useRef(null);
      const collectionAsset = (name) => "/assets/collections/".concat(name, ".png");
      React.useEffect(() => {
        const close = () => setVisible(false);
        const open = async (options = {}) => {
          let nextUnlocked = typeof options.unlocked === "boolean" ? options.unlocked : false;
          if (typeof options.unlocked !== "boolean") {
            try {
              const response = await fetch("/api/check-in");
              if (response.ok) {
                const status = await response.json();
                nextUnlocked = Array.isArray(status.collection) && status.collection.includes("langomon-doll");
              }
            } catch (e2) {
            }
          }
          setUnlocked(nextUnlocked);
          setScrollProgress(0);
          setVisible(true);
          requestAnimationFrame(() => {
            if (listRef.current) listRef.current.scrollTop = 0;
          });
        };
        const onOpen = (event) => {
          open(event.detail || {});
        };
        window.LangoCollection = { open, close };
        window.addEventListener("lango:open-collection", onOpen);
        return () => {
          var _a;
          window.removeEventListener("lango:open-collection", onOpen);
          if (((_a = window.LangoCollection) == null ? void 0 : _a.open) === open) delete window.LangoCollection;
        };
      }, []);
      const closeCollection = () => {
        var _a, _b;
        (_a = window.LangoSfx) == null ? void 0 : _a.play("back");
        setVisible(false);
        (_b = document.querySelector(".lango-home__collections")) == null ? void 0 : _b.focus();
      };
      return e(
        "section",
        {
          id: "collection-overlay",
          className: visible ? "visible" : "",
          role: "dialog",
          "aria-modal": "true",
          "aria-hidden": visible ? "false" : "true",
          "aria-labelledby": "collection-title",
          "data-state": unlocked ? "unlocked" : "locked",
          "data-node-id": unlocked ? "768:1173" : "768:1141"
        },
        e("h2", { id: "collection-title", className: "collection-sr-title" }, "Doll Collection"),
        e("img", { className: "collection-background", src: collectionAsset("background"), alt: "", draggable: false }),
        e("img", { className: "collection-title", src: collectionAsset("object"), alt: "", draggable: false }),
        e(
          "button",
          { type: "button", className: "collection-return", onClick: closeCollection, "aria-label": "Return home" },
          e("img", { src: collectionAsset("return"), alt: "", draggable: false })
        ),
        e(
          "ol",
          {
            ref: listRef,
            className: "collection-list",
            "aria-label": unlocked ? "Unlocked dolls" : "Locked dolls",
            onScroll: (event) => {
              const list = event.currentTarget;
              const available = list.scrollHeight - list.clientHeight;
              setScrollProgress(available > 0 ? list.scrollTop / available : 0);
            }
          },
          ...COLLECTION_DOLLS.map((doll, index) => e(
            "li",
            {
              key: index,
              className: "collection-row ".concat(unlocked ? "unlocked" : "locked"),
              style: {
                "--row-height": "".concat(doll.rowHeight / 9.54, "cqh"),
                "--doll-left": "".concat(doll.left / 8.98, "%"),
                "--doll-size": "".concat(doll.size / 8.98, "%"),
                "--lock-top": "".concat(doll.lockTop / doll.rowHeight * 100, "%")
              },
              "aria-label": unlocked ? "Doll ".concat(index + 1, ", unlocked") : "Doll ".concat(index + 1, ", locked")
            },
            e("img", { className: "collection-doll", src: collectionAsset("".concat(unlocked ? "unlocked" : "locked", "-").concat(index + 1)), alt: "", draggable: false }),
            !unlocked && e("img", { className: "collection-lock", src: collectionAsset("lock"), alt: "", draggable: false }),
            e("img", { className: "collection-divider", src: collectionAsset("divider"), alt: "", draggable: false })
          ))
        ),
        e(
          "div",
          { className: "collection-scrollbar", "aria-hidden": "true", style: { "--scroll-thumb-top": "".concat(scrollProgress * 87.34, "%") } },
          e("span", { className: "collection-scrollbar-thumb" })
        )
      );
    }
    function LangoHome() {
      const [comingSoonFeature, setComingSoonFeature] = React.useState(null);
      const [roomScene, setRoomScene] = React.useState(() => ROOM_SCENE_LABELS[window.LangoRoomScene] ? window.LangoRoomScene : "livingroom");
      React.useEffect(() => {
        const syncRoomScene = (event) => {
          var _a;
          const scene = (_a = event.detail) == null ? void 0 : _a.scene;
          if (ROOM_SCENE_LABELS[scene]) setRoomScene(scene);
        };
        window.addEventListener("lango:room-scene", syncRoomScene);
        return () => window.removeEventListener("lango:room-scene", syncRoomScene);
      }, []);
      const [hasPlayedVocabGame, setHasPlayedVocabGame] = React.useState(() => {
        try {
          return window.localStorage.getItem("lango-vocab-game-played") === "1";
        } catch (e2) {
          return false;
        }
      });
      React.useEffect(() => {
        const syncVocabGameReminder = () => {
          try {
            setHasPlayedVocabGame(window.localStorage.getItem("lango-vocab-game-played") === "1");
          } catch (e2) {
          }
        };
        window.addEventListener("pageshow", syncVocabGameReminder);
        return () => window.removeEventListener("pageshow", syncVocabGameReminder);
      }, []);
      const transitionBusy = React.useRef(false);
      const openRewards = () => {
        var _a;
        return (_a = document.getElementById("daily-rewards-btn")) == null ? void 0 : _a.click();
      };
      const go = (_kind, path) => {
        if (transitionBusy.current) return;
        transitionBusy.current = true;
        if (window.LangoPageTransition && window.LangoPageTransition.navigate) {
          window.LangoPageTransition.navigate(path);
          return;
        }
        window.location.href = path;
      };
      const reveal = (_kind, action) => {
        if (transitionBusy.current) return;
        transitionBusy.current = true;
        if (!(window.LangoPageTransition && window.LangoPageTransition.play)) {
          action == null ? void 0 : action();
          transitionBusy.current = false;
          return;
        }
        window.LangoPageTransition.play({ onCovered: action }).finally(() => {
          transitionBusy.current = false;
        });
      };
      const closeComingSoon = () => {
        var _a;
        (_a = window.LangoSfx) == null ? void 0 : _a.play("back");
        setComingSoonFeature(null);
      };
      const roomLabel = ROOM_SCENE_LABELS[roomScene];
      return e(
        "main",
        { className: "lango-home", "data-node-id": "49:62", "aria-label": roomLabel },
        comingSoonFeature && e(ComingSoonDialog, { feature: comingSoonFeature, onClose: closeComingSoon }),
        e("img", { className: "lango-home__title", src: asset("".concat(roomScene, "_header")), alt: "".concat(roomLabel, " header") }),
        e(
          "section",
          { id: "hko-weather-bar", className: "lango-home__clock", "aria-label": "Hong Kong weather", "aria-live": "polite" },
          e("img", { className: "lango-home__weather-frame", src: asset("clock"), alt: "", draggable: false }),
          e(
            "div",
            { className: "hko-weather-details" },
            e("div", { id: "hko-weather-location" }, "Hong Kong"),
            e("div", { id: "hko-weather-datetime" }, "--"),
            e(
              "div",
              { className: "hko-weather-row" },
              e("img", { id: "hko-weather-icon", alt: "", width: 32, height: 32, hidden: true }),
              e("span", { id: "hko-weather-condition" }, "Weather"),
              e("span", { className: "hko-weather-stat" }, e("strong", { id: "hko-weather-temp" }, "--")),
              e("span", { className: "hko-weather-stat", "aria-label": "Humidity" }, "\u{1F4A7}", e("strong", { id: "hko-weather-humidity" }, "--"))
            )
          )
        ),
        e("img", { className: "lango-home__starbar", src: asset("starbar"), alt: "" }),
        e("span", { className: "lango-home__stars", "aria-label": "30 stars" }, "30"),
        e(ImageButton, { className: "lango-home__record", image: "store", label: "Record", onClick: () => setComingSoonFeature("Record"), sfx: "weakness" }),
        e(ImageButton, { className: "lango-home__map", image: "reward", label: "Map", onClick: () => go("map", "/map") }),
        e(ImageButton, { className: "lango-home__reward", image: "box", label: "Reward", onClick: () => reveal("reward", openRewards), sfx: "powerUp" }),
        e(ImageButton, {
          className: "lango-home__collections",
          image: "map",
          label: "Collections",
          onClick: () => reveal("collection", () => window.dispatchEvent(new CustomEvent("lango:open-collection"))),
          sfx: "powerUp"
        }),
        e(ImageButton, { className: "lango-home__store", image: "chair", label: "Store", onClick: () => setComingSoonFeature("Store"), sfx: "weakness" }),
        e(ImageButton, {
          className: "lango-home__box".concat(hasPlayedVocabGame ? "" : " is-reminding"),
          image: "home",
          label: "Play Word Chop vocab game",
          onClick: () => go("game", "/vocab-game/index.html")
        }),
        e("div", { className: "lango-home__frame", "aria-hidden": true })
      );
    }
    ReactDOM.createRoot(document.getElementById("lango-home-root")).render(e(LangoHome));
    ReactDOM.createRoot(document.getElementById("daily-rewards-root")).render(e(DailyRewards));
    ReactDOM.createRoot(document.getElementById("collection-root")).render(e(Collection));
    const showCollectionPreview = (screen) => {
      if (screen !== "collection-locked" && screen !== "collection-unlocked") return;
      document.getElementById("splash-screen").hidden = true;
      document.body.classList.remove("preview-screen-collection-locked", "preview-screen-collection-unlocked");
      document.body.classList.add("preview-mode", "preview-screen-".concat(screen));
      window.dispatchEvent(new CustomEvent("lango:open-collection", {
        detail: { unlocked: screen === "collection-unlocked" }
      }));
    };
    const collectionPreviewSelect = document.getElementById("preview-screen-select");
    collectionPreviewSelect == null ? void 0 : collectionPreviewSelect.addEventListener("change", () => showCollectionPreview(collectionPreviewSelect.value));
    const initialCollectionPreview = new URLSearchParams(location.search).get("screen");
    setTimeout(() => showCollectionPreview(initialCollectionPreview), 0);
  })();
})();
