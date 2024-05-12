async function saveSettings() {
  try {
    const notificationCount =
      document.getElementById("notification-count").value;
    const notifyAnimotaku = document.getElementById("notify-animotaku").checked;
    const notifyAdala = document.getElementById("notify-adala").checked;
    const notifyPlaneteBD = document.getElementById("notify-planetebd").checked;
    const enableNotifications = document.getElementById(
      "enable-notifications"
    ).checked;
    const refreshInterval = parseInt(
      document.getElementById("refresh-interval").value,
      10
    );

    await browser.storage.sync.set({
      notificationCount,
      notifyAnimotaku,
      notifyAdala,
      notifyPlaneteBD,
      refreshInterval,
      enableNotifications,
    });

    console.log("Settings saved successfully.");
    displayNews();
  } catch (error) {
    console.error("Error saving settings:", error);
  }
}

async function loadSettings() {
  try {
    const settings = await browser.storage.sync.get({
      notificationCount: 6,
      notifyAnimotaku: true,
      notifyAdala: true,
      notifyPlaneteBD: true,
      refreshInterval: 10,
      enableNotifications: true,
    });

    document.getElementById("notification-count").value =
      settings.notificationCount;
    document.getElementById("notify-animotaku").checked =
      settings.notifyAnimotaku;
    document.getElementById("notify-adala").checked = settings.notifyAdala;
    document.getElementById("notify-planetebd").checked =
      settings.notifyPlaneteBD;
    document.getElementById("refresh-interval").value =
      settings.refreshInterval;
    document.getElementById("enable-notifications").checked =
      settings.enableNotifications;
    console.log("Settings loaded successfully.");
  } catch (error) {
    console.error("Error loading settings:", error);
  }
}

function saveArticlesToCache(articles) {
  localStorage.setItem("cachedArticles", JSON.stringify(articles));
}

function getArticlesFromCache() {
  const cachedArticles = localStorage.getItem("cachedArticles");
  return cachedArticles ? JSON.parse(cachedArticles) : null;
}

async function fetchLatestArticles() {
  const [animotakuArticles, adalaArticles, planeteBDArticles] =
    await Promise.all([
      fetchNews(
        "Animotaku",
        "https://animotaku.fr/category/actualite/",
        ".elementor-post",
        mapAnimotakuArticle
      ),
      fetchNews(
        "Adala News",
        "https://adala-news.fr/",
        ".list-post",
        mapAdalaArticle
      ),
      fetchNews(
        "Planète BD",
        "https://www.planetebd.com/planete-bd/manga",
        "entry",
        mapPlaneteBDArticle
      ),
    ]);

  let allArticles = [
    ...animotakuArticles,
    ...adalaArticles,
    ...planeteBDArticles,
  ];

  allArticles = await filterArticlesBySettings(allArticles);
  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  return allArticles;
}

async function filterArticlesBySettings(articles) {
  const settings = await browser.storage.sync.get({
    notifyAnimotaku: true,
    notifyAdala: true,
    notifyPlaneteBD: true,
  });

  return articles.filter((article) => {
    if (article.source === "Animotaku") {
      return settings.notifyAnimotaku;
    }
    if (article.source === "Adala News") {
      return settings.notifyAdala;
    }
    if (article.source === "Planète BD") {
      return settings.notifyPlaneteBD;
    }
    return true;
  });
}

async function displayNews(startIndex = 0, count = 20) {
  try {
    const { cachedArticles } = await browser.storage.local.get(
      "cachedArticles"
    );

    if (!cachedArticles || cachedArticles.length === 0) {
      const articlesContainer = document.getElementById("articles");
      articlesContainer.innerHTML = "<p>Pas d'article trouvé.</p>";
      return;
    }

    const allArticles = await filterArticlesBySettings(cachedArticles);
    const articlesToDisplay = allArticles.slice(startIndex, startIndex + count);
    const articlesContainer = document.getElementById("articles");

    if (startIndex === 0) {
      articlesContainer.innerHTML = "";
    }

    articlesContainer.innerHTML += articlesToDisplay
      .map(createArticleElement)
      .join("");

    if (startIndex + count < allArticles.length) {
      const showMoreButton = document.createElement("button");
      showMoreButton.textContent = "Afficher Plus";
      showMoreButton.classList.add("show-more");
      showMoreButton.addEventListener("click", () => {
        showMoreButton.remove();
        displayNews(startIndex + count, count);
      });
      articlesContainer.appendChild(showMoreButton);
    }

    lazyLoadImages();
  } catch (error) {
    console.error("Error displaying news:", error);
  }
}

function createArticleElement(article) {
  const formattedDate = formatDate(article.date);

  return `
    <div class="article">
      <a href="${article.link}" target="_blank">
        <div class="article-image">
          <img src="placeholder.jpg" data-src="${article.thumbnail}" alt="${
    article.title
  }" class="lazy-load">
        </div>
        <div class="article-content">
          <h2>${article.title}</h2>
          <p class="meta">${article.author} | ${formatDate(article.date)} | ${
    article.source
  }</p>
          <p>${article.excerpt}</p>
        </div>
      </a>
    </div>
  `;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function lazyLoadImages() {
  const lazyImages = document.querySelectorAll(".lazy-load");
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove("lazy-load");
        observer.unobserve(img);
      }
    });
  });
  lazyImages.forEach((img) => observer.observe(img));
}

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "updateArticles") {
    const newArticles = message.articles;
    const cachedArticles = getArticlesFromCache() || [];
    const updatedArticles = [...newArticles, ...cachedArticles];
    saveArticlesToCache(updatedArticles);
    displayNews();
  }
});

document.addEventListener("DOMContentLoaded", () => {
  browser.runtime.sendMessage({ action: "resetBadgeCount" });
});

function toggleSettingsPanel() {
  const settingsPanel = document.getElementById("settings-panel");
  settingsPanel.classList.toggle("collapsed");
  settingsPanel.classList.toggle("expanded");
}

document
  .getElementById("toggle-settings")
  .addEventListener("click", toggleSettingsPanel);
document
  .getElementById("settings-header")
  .addEventListener("click", toggleSettingsPanel);

document
  .getElementById("save-settings")
  .addEventListener("click", saveSettings);
loadSettings();
displayNews();
