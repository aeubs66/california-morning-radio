const $ = (id) => document.getElementById(id);
const time = (s) => {
  s = Number.isFinite(s) ? Math.floor(s) : 0;
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};
const playIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7z"/></svg>';
const pauseIcon =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
export function createPlayer(onToggle, onChange) {
  const audio = $("audio"),
    canvas = $("waveform"),
    ctx = canvas.getContext("2d");
  let context,
    analyser,
    data,
    frame,
    recording = null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  function draw() {
    cancelAnimationFrame(frame);
    const w = canvas.clientWidth,
      h = canvas.clientHeight,
      dpr = Math.min(devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(w * dpr) ||
      canvas.height !== Math.round(h * dpr)
    ) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const active =
      analyser &&
      !audio.paused &&
      !audio.ended &&
      !document.hidden &&
      !reduced.matches;
    if (active) analyser.getByteFrequencyData(data);
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, "#d79945");
    gradient.addColorStop(0.5, "#ffe0a1");
    gradient.addColorStop(1, "#8bc2dc");
    ctx.fillStyle = gradient;
    const count = Math.floor(w / 5);
    for (let i = 0; i < count; i++) {
      const height = active
        ? Math.max(
            2,
            (data[Math.floor((i / count) * data.length)] / 255) * h * 0.85,
          )
        : 2;
      ctx.fillRect(i * 5, (h - height) / 2, 2, height);
    }
    if (active) frame = requestAnimationFrame(draw);
  }
  async function play() {
    // The context is created/resumed synchronously from the user's Play action.
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !context) {
        context = new AC();
        analyser = context.createAnalyser();
        analyser.fftSize = 256;
        data = new Uint8Array(analyser.frequencyBinCount);
        context.createMediaElementSource(audio).connect(analyser);
        analyser.connect(context.destination);
      }
      if (context?.state === "suspended") await context.resume();
      await audio.play();
    } catch {
      $("status-message").textContent =
        "Playback could not start. Tap Play again, or download your recording.";
    }
  }
  function sync() {
    const active = !audio.paused && !audio.ended;
    $("player-play").innerHTML = active ? pauseIcon : playIcon;
    $("player-play").setAttribute(
      "aria-label",
      active
        ? "Pause recording"
        : recording
          ? "Play recording"
          : "Generate selected city broadcast",
    );
    $("player-play").setAttribute("aria-pressed", String(active));
    $("player-label").textContent = active
      ? "NOW PLAYING"
      : recording
        ? "YOUR EDITION IS READY"
        : "YOUR MOMENT OF CALIFORNIA";
    onChange(active);
    draw();
  }
  for (const event of ["play", "pause", "ended"])
    audio.addEventListener(event, sync);
  audio.addEventListener("error", () => {
    $("status-message").textContent =
      "This recording could not be loaded. Generate a fresh edition or try downloading it.";
  });
  for (const event of ["timeupdate", "loadedmetadata", "durationchange"])
    audio.addEventListener(event, () => {
      $("elapsed").textContent = time(audio.currentTime);
      $("duration").textContent = time(audio.duration);
      $("seek").value = audio.duration
        ? Math.round((audio.currentTime / audio.duration) * 1000)
        : 0;
      $("seek").setAttribute(
        "aria-valuetext",
        time(audio.currentTime) + " of " + time(audio.duration),
      );
    });
  audio.volume = 0.8;
  $("player-play").onclick = () => onToggle();
  $("seek").oninput = (e) => {
    if (Number.isFinite(audio.duration))
      audio.currentTime = (Number(e.target.value) / 1000) * audio.duration;
  };
  $("volume").oninput = (e) => (audio.volume = Number(e.target.value));
  $("restart").onclick = () => (audio.currentTime = 0);
  $("forward").onclick = () => {
    if (Number.isFinite(audio.duration))
      audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
  };
  new ResizeObserver(draw).observe(canvas);
  document.addEventListener("visibilitychange", draw);
  reduced.addEventListener("change", draw);
  draw();
  return {
    audio,
    play,
    toggle() {
      audio.paused ? play() : audio.pause();
    },
    load(record) {
      audio.pause();
      recording = record;
      if (record) {
        audio.src = record.url;
        audio.load();
        $("player-title").textContent = record.city;
        $("player-meta").textContent = record.meta;
        $("download").href = record.url;
        $("download").download = record.filename;
        $("download").setAttribute("aria-disabled", "false");
      } else {
        audio.removeAttribute("src");
        audio.load();
        $("download").removeAttribute("href");
        $("download").setAttribute("aria-disabled", "true");
        $("elapsed").textContent = "0:00";
        $("duration").textContent = "0:00";
        $("seek").value = 0;
      }
      for (const id of ["seek", "restart", "forward", "update-edition"])
        $(id).disabled = !record;
      sync();
    },
    generating(value) {
      $("player-play").disabled = value;
      $("cancel-generation").hidden = !value;
      $("update-edition").disabled = value || !recording;
      if (value) $("player-label").textContent = "CREATING YOUR RADIO EDITION";
      else {
        if (recording) {
          $("player-title").textContent = recording.city;
          $("player-meta").textContent = recording.meta;
        }
        sync();
      }
    },
    get record() {
      return recording;
    },
  };
}
