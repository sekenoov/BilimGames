/* BilimGames: стартовая страница. Предмет → тема → игра.
   Чтобы добавить предмет или тему, допишите их в SUBJECTS. */
(function () {
  "use strict";

  const SUBJECTS = [
    {
      id: "history",
      img: "history-kz/assets/cover.png",
      ru: { name: "История Казахстана", note: "Игра на казахском и русском языке" },
      kz: { name: "Қазақстан тарихы", note: "Ойын қазақ және орыс тілінде" },
      en: { name: "History of Kazakhstan", note: "The game is in Kazakh and Russian" },
      topics: [
        { href: "history-kz/index.html?topic=turks", img: "history-kz/assets/t_altai.png",
          ru: { name: "Империя тюркских кочевников", about: "Тюркский каганат, Шёлковый путь, Караханиды, кыпчаки" },
          kz: { name: "Түркі көшпелілерінің империясы", about: "Түрік қағанаты, Жібек жолы, Қарахандар, қыпшақтар" },
          en: { name: "Empire of the Turkic nomads", about: "The Turkic Khaganate, the Silk Road, the Karakhanids, the Kipchaks" } },
        { href: "history-kz/index.html?topic=khanate", img: "history-kz/assets/k_kozybasy.png",
          ru: { name: "Казахское ханство", about: "Керей и Жанибек, ханы, бии, «Жеті жарғы», борьба с джунгарами" },
          kz: { name: "Қазақ хандығы", about: "Керей мен Жәнібек, хандар, билер, «Жеті жарғы», жоңғарлармен күрес" },
          en: { name: "The Kazakh Khanate", about: "Kerei and Zhanibek, khans, biys, 'Zheti Zhargy', the fight against the Dzungars" } },
        { href: "history-kz/index.html?topic=both", img: "history-kz/assets/k_turkistan.png",
          ru: { name: "Обе темы", about: "Один путь от Тюркского каганата до Казахского ханства" },
          kz: { name: "Екі тақырып та", about: "Түрік қағанатынан Қазақ хандығына дейінгі бір жол" },
          en: { name: "Both topics", about: "One road from the Turkic Khaganate to the Kazakh Khanate" } }
      ]
    },
    {
      id: "english",
      img: "english/tech-trail/assets/cover.png",
      ru: { name: "Английский язык", note: "Игра на английском, уровень A2-B1" },
      kz: { name: "Ағылшын тілі", note: "Ойын ағылшын тілінде, A2-B1 деңгейі" },
      en: { name: "English", note: "The game is in English, level A2-B1" },
      topics: [
        { href: "english/tech-trail/index.html", img: "english/tech-trail/assets/techlab.png",
          ru: { name: "Tech Trail: польза и вред технологий", about: "Говорим по-английски о гаджетах, интернете и играх" },
          kz: { name: "Tech Trail: технологияның пайдасы мен зияны", about: "Гаджет, интернет және ойындар туралы ағылшынша сөйлейміз" },
          en: { name: "Tech Trail: the good and bad sides of technology", about: "Speak English about gadgets, the internet and games" } }
      ]
    }
  ];

  const T = {
    ru: {
      eyebrow: "Платформа игр для урока",
      title: "Учимся вместе, играя всем классом",
      lead: "Игры для общего экрана: команды отвечают, учитель ставит очки, оператор ведёт игру с клавиатуры.",
      facts: ["2-4 команды", "10-20 минут", "Работает без интернета"],
      play: "Играть",
      back: "Назад",
      step: "Шаг",
      chooseSubject: "Выберите предмет",
      chooseTopic: "Выберите тему",
      topics: (n) => `${n} ${n === 1 ? "тема" : n < 5 ? "темы" : "тем"}`,
      open: "Открыть"
    },
    kz: {
      eyebrow: "Сабаққа арналған ойындар платформасы",
      title: "Бүкіл сынып бірге ойнап үйренеміз",
      lead: "Ортақ экранға арналған ойындар: командалар жауап береді, мұғалім ұпай қояды, оператор ойынды пернетақтамен жүргізеді.",
      facts: ["2-4 команда", "10-20 минут", "Интернетсіз жұмыс істейді"],
      play: "Ойнау",
      back: "Артқа",
      step: "Қадам",
      chooseSubject: "Пәнді таңдаңыз",
      chooseTopic: "Тақырыпты таңдаңыз",
      topics: (n) => `${n} тақырып`,
      open: "Ашу"
    },
    en: {
      eyebrow: "Classroom games platform",
      title: "Learn together, play as a whole class",
      lead: "Games for a shared screen: teams answer, the teacher gives points, an operator runs the game from the keyboard.",
      facts: ["2-4 teams", "10-20 minutes", "Works offline"],
      play: "Play",
      back: "Back",
      step: "Step",
      chooseSubject: "Choose a subject",
      chooseTopic: "Choose a topic",
      topics: (n) => `${n} ${n === 1 ? "topic" : "topics"}`,
      open: "Open"
    }
  };
  const LANGS = ["kz", "ru", "en"];

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let lang = "kz";
  try { const s = localStorage.getItem("bilim-lang"); if (LANGS.includes(s)) lang = s; } catch (e) {}
  let subject = null;

  function route() {
    const h = location.hash.replace("#", "");
    if (h === "subjects") return { view: "subjects" };
    const s = SUBJECTS.find((x) => x.id === h);
    if (s) return { view: "topics", subject: s };
    return { view: "home" };
  }

  function render() {
    const t = T[lang];
    document.documentElement.lang = { kz: "kk", ru: "ru", en: "en" }[lang];
    document.querySelectorAll("[data-t]").forEach((n) => { const v = t[n.dataset.t]; if (typeof v === "string") n.textContent = v; });
    const lb = [...document.querySelectorAll(".lang button")];
    lb.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.lang === lang)));
    $(".lang").style.setProperty("--n", lb.length);
    $(".lang").style.setProperty("--i", Math.max(0, lb.findIndex((b) => b.dataset.lang === lang)));
    $("#facts").innerHTML = t.facts.map((f) => `<li>${esc(f)}</li>`).join("");

    $("#subjects").innerHTML = SUBJECTS.map((s, i) => `
      <a class="tile tile--big" href="#${s.id}">
        <img src="${s.img}" alt="">
        <span class="tile__body">
          <kbd>${i + 1}</kbd>
          <b>${esc(s[lang].name)}</b>
          <span>${esc(s[lang].note)}</span>
          <small>${esc(t.topics(s.topics.length))}</small>
        </span>
      </a>`).join("");

    const r = route();
    subject = r.subject || null;
    if (subject) {
      $("#topics-subject").textContent = subject[lang].name;
      $("#topics").className = "tiles tiles--" + Math.min(subject.topics.length, 3);
      $("#topics").innerHTML = subject.topics.map((tp, i) => `
        <a class="tile" href="${tp.href}${lang === "en" ? "" : (tp.href.includes("?") ? "&" : "?") + "lang=" + lang}">
          <span class="tile__img"><img src="${tp.img}" alt=""></span>
          <span class="tile__body">
            <kbd>${i + 1}</kbd>
            <b>${esc(tp[lang].name)}</b>
            <span>${esc(tp[lang].about)}</span>
          </span>
        </a>`).join("");
    }
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + r.view));
  }

  function setLang(l) {
    if (l === lang) return;
    lang = l;
    try { localStorage.setItem("bilim-lang", lang); } catch (err) {}
    render();
  }

  function go(view) { location.hash = view === "home" ? "" : view; }
  function back() { const r = route(); go(r.view === "topics" ? "subjects" : "home"); }

  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-go]");
    if (g) { e.preventDefault(); go(g.dataset.go); return; }
    if (e.target.closest("[data-back]")) { back(); return; }
    const l = e.target.closest("[data-lang]");
    if (l) setLang(l.dataset.lang);
  });
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const r = route();
    if (e.code === "KeyL") { setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]); return; }
    if (r.view === "home" && e.key === "Enter" && !e.target.closest("a, button")) { e.preventDefault(); go("subjects"); return; }
    if (e.key === "Escape" || e.key === "Backspace") { if (r.view !== "home") { e.preventDefault(); back(); } return; }
    const d = /^Digit([1-9])$/.exec(e.code);
    if (d) {
      const links = document.querySelectorAll(".view.is-active .tile");
      const a = links[Number(d[1]) - 1];
      if (a) a.click();
    }
  });

  // Подложка, которая переезжает к выбранному языку.
  $(".lang").insertAdjacentHTML("afterbegin", '<span class="seg-thumb" aria-hidden="true"></span>');
  render();
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("is-ready")));
})();
