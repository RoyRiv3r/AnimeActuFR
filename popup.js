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

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("newsDB", 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("articles")) {
        db.createObjectStore("articles", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function saveArticlesToCache(articles) {
  const db = await openIndexedDB();
  const transaction = db.transaction("articles", "readwrite");
  const store = transaction.objectStore("articles");

  articles.forEach((article) => {
    store.put(article);
  });

  return transaction.complete;
}

async function getArticlesFromCache() {
  const db = await openIndexedDB();
  const transaction = db.transaction("articles", "readonly");
  const store = transaction.objectStore("articles");

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

function addArticleToLateralPanel(article) {
  const savedArticles = JSON.parse(localStorage.getItem("savedArticles")) || [];
  if (
    !savedArticles.some((savedArticle) => savedArticle.link === article.link)
  ) {
    savedArticles.push(article);
    localStorage.setItem("savedArticles", JSON.stringify(savedArticles));
    displaySavedArticles();
    showSuccessToast("Article ajouté aux favoris");
  } else {
    showFailureToast("L'article est déjà dans les favoris");
  }
}

function removeArticleFromLateralPanel(article) {
  const savedArticles = JSON.parse(localStorage.getItem("savedArticles")) || [];
  const updatedArticles = savedArticles.filter(
    (savedArticle) => savedArticle.link !== article.link
  );
  localStorage.setItem("savedArticles", JSON.stringify(updatedArticles));
  displaySavedArticles();
}

function displaySavedArticles() {
  const savedArticlesContainer = document.getElementById("saved-articles");
  const savedArticles = JSON.parse(localStorage.getItem("savedArticles")) || [];

  savedArticlesContainer.innerHTML = savedArticles
    .map(
      (article) => `
        <div class="saved-article">
          <img src="${article.thumbnail}" alt="${article.title}">
          <div class="saved-article-content">
            <h3>${article.title}</h3>
            <p class="meta">${formatDate(article.date)}</p>
            <p>${article.excerpt}</p>
          </div>
          <button class="remove-article" data-link="${
            article.link
          }">Supprimer</button>
        </div>
      `
    )
    .join("");

  savedArticlesContainer
    .querySelectorAll(".remove-article")
    .forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const link = button.dataset.link;
        const article = savedArticles.find(
          (savedArticle) => savedArticle.link === link
        );
        removeArticleFromLateralPanel(article);
      });
    });

  savedArticlesContainer
    .querySelectorAll(".saved-article")
    .forEach((savedArticle) => {
      savedArticle.addEventListener("click", () => {
        const link = savedArticle.querySelector(".remove-article").dataset.link;
        window.open(link, "_blank");
      });
    });
}

function toggleLateralPanel(event) {
  const lateralPanel = document.getElementById("lateral-panel");
  const toggleButton = document.getElementById("toggle-lateral-panel");

  if (
    event &&
    !lateralPanel.contains(event.target) &&
    event.target !== toggleButton
  ) {
    lateralPanel.classList.remove("expanded");
    lateralPanel.classList.add("collapsed");
  } else {
    lateralPanel.classList.toggle("collapsed");
    lateralPanel.classList.toggle("expanded");
  }
}

document
  .getElementById("toggle-lateral-panel")
  .addEventListener("click", (event) => toggleLateralPanel(event));

document.addEventListener("click", (event) => {
  const lateralPanel = document.getElementById("lateral-panel");
  const toggleButton = document.getElementById("toggle-lateral-panel");

  if (!lateralPanel.contains(event.target) && event.target !== toggleButton) {
    toggleLateralPanel(event);
  }
});

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
    const cachedArticles = await getArticlesFromCache();

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
  const escapedArticleJSON = JSON.stringify(article).replace(/'/g, "&#39;");

  return `
    <div class="article" data-source="${article.source}">
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
      <button class="add-to-lateral-panel" data-article='${escapedArticleJSON}' title="Ajouter au favoris"></button>
    </div>
  `;
}

function showToast(message, type) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.classList.add("toast", type);
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 100);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

function showSuccessToast(message) {
  showToast(message, "success");
}

function showFailureToast(message) {
  showToast(message, "failure");
}

document.addEventListener("click", (event) => {
  if (event.target.classList.contains("add-to-lateral-panel")) {
    const article = JSON.parse(event.target.dataset.article);
    addArticleToLateralPanel(article);
  }
});

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
    getArticlesFromCache().then((cachedArticles) => {
      const updatedArticles = [...newArticles, ...cachedArticles];
      saveArticlesToCache(updatedArticles);
      displayNews();
    });
  }
});

document.addEventListener("DOMContentLoaded", () => {
  browser.runtime.sendMessage({ action: "resetBadgeCount" });
  displaySavedArticles();
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
