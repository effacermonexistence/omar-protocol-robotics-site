const header = document.querySelector("[data-elevate]");
const drawer = document.querySelector(".detail-drawer");
const drawerTitle = document.querySelector("#drawer-title");
const detailTriggers = document.querySelectorAll("[data-detail-target]");
const closeButtons = document.querySelectorAll("[data-close-details]");
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");
const revealItems = document.querySelectorAll(".reveal");
const filmSections = document.querySelectorAll(".film-section");
const motionImages = document.querySelectorAll("[data-motion-image]");
const heroVideos = document.querySelectorAll("[data-hero-video]");
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const tabTitles = {
  layer: "Robotics reliability",
  modules: "Reliability layer",
  sdk: "SDK wrapper",
  benchmarks: "Benchmarks",
  access: "Request access",
};

const setHeader = () => {
  header.classList.toggle("is-solid", window.scrollY > 18);
};

const activateTab = (target = "layer") => {
  const safeTarget = tabTitles[target] ? target : "layer";
  drawerTitle.textContent = tabTitles[safeTarget];

  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tabTarget === safeTarget);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.tabPanel === safeTarget);
  });
};

const openDetails = (target) => {
  activateTab(target);
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
};

const closeDetails = () => {
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
};

setHeader();
activateTab("layer");

window.addEventListener("scroll", setHeader, { passive: true });

if (heroVideos.length) {
  const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
  const shouldUseLocalVideo = localHostnames.has(window.location.hostname);

  const playHeroVideo = (video) => {
    const playAttempt = video.play();
    if (playAttempt && typeof playAttempt.catch === "function") {
      playAttempt.catch(() => {});
    }
  };

  heroVideos.forEach((video) => {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("muted", "");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");

    const selectedSrc = shouldUseLocalVideo ? video.dataset.localSrc : video.dataset.publicSrc;
    const selectedPoster = shouldUseLocalVideo ? video.dataset.localPoster : video.dataset.publicPoster;

    if (selectedPoster) video.poster = selectedPoster;
    if (selectedSrc && video.currentSrc !== selectedSrc && video.getAttribute("src") !== selectedSrc) {
      video.src = selectedSrc;
      video.load();
    }

    const requestPlay = () => playHeroVideo(video);

    if (video.readyState >= 2) requestPlay();
    video.addEventListener("loadedmetadata", requestPlay, { once: true });
    video.addEventListener("canplay", requestPlay, { once: true });
    video.addEventListener("playing", () => video.classList.add("is-playing"));
    window.addEventListener("pageshow", requestPlay);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) requestPlay();
    });

    ["pointerdown", "touchstart", "click"].forEach((eventName) => {
      window.addEventListener(eventName, requestPlay, { once: true, passive: true });
    });

    requestPlay();
  });
}

if (filmSections.length) {
  let canvasTicking = false;

  const updateCanvasSections = () => {
    canvasTicking = false;

    const viewport = window.innerHeight || 1;
    let activeSection = filmSections[0];

    filmSections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= viewport * 0.42) activeSection = section;
    });

    filmSections.forEach((section) => {
      section.classList.toggle("is-canvas-active", section === activeSection);
    });

    document.body.classList.add("is-canvas-ready");
  };

  const requestCanvasSections = () => {
    if (canvasTicking) return;
    canvasTicking = true;
    requestAnimationFrame(updateCanvasSections);
  };

  updateCanvasSections();
  window.addEventListener("scroll", requestCanvasSections, { passive: true });
  window.addEventListener("resize", requestCanvasSections);
}

detailTriggers.forEach((trigger) => {
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    openDetails(trigger.dataset.detailTarget);
  });
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tabTarget));
});

closeButtons.forEach((button) => {
  button.addEventListener("click", closeDetails);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDetails();
});

if (!prefersReduced && motionImages.length) {
  let ticking = false;

  const setFrameMotion = () => {
    ticking = false;

    motionImages.forEach((image) => {
      const section = image.closest(".film-section");
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const progress = Math.min(1, Math.max(0, (viewport - rect.top) / (viewport + rect.height)));
      const shift = (progress - 0.5) * -54;
      image.style.setProperty("--frame-shift", `${shift.toFixed(2)}px`);
    });
  };

  const requestMotion = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(setFrameMotion);
  };

  setFrameMotion();
  window.addEventListener("scroll", requestMotion, { passive: true });
  window.addEventListener("resize", requestMotion);
}

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
  );

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}
