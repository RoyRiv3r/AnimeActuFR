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

async function fetchNews(source, url, selector, mapper) {
  try {
    console.log(`Fetching news from ${source}...`);
    const response = await fetch(url);
    const data = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(data, "text/html");
    const articles = Array.from(doc.querySelectorAll(selector));
    return articles.map(mapper).filter((article) => article !== null);
  } catch (error) {
    console.error(`Error fetching ${source} news:`, error);
    return [];
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

function mapAnimotakuArticle(article) {
  try {
    return {
      title: article
        .querySelector(".elementor-post__title a")
        .textContent.trim(),
      link: article.querySelector(".elementor-post__title a").href,
      excerpt: article
        .querySelector(".elementor-post__excerpt p")
        .textContent.trim(),
      author: article
        .querySelector(".elementor-post-author")
        .textContent.trim(),
      date: getDate(
        article.querySelector(".elementor-post-date").textContent.trim()
      ),
      thumbnail: getThumbnailUrl(
        article
          .querySelector(".elementor-post__thumbnail img")
          .getAttribute("data-lazy-src")
      ),
      source: "Animotaku",
    };
  } catch (error) {
    console.error("Error mapping Animotaku article:", error);
    return null;
  }
}

function mapAdalaArticle(article) {
  try {
    return {
      title: article.querySelector(".penci-entry-title a").textContent.trim(),
      link: article.querySelector(".penci-entry-title a").href,
      excerpt: article.querySelector(".item-content p").textContent.trim(),
      author: article.querySelector(".author-url").textContent.trim(),
      date: new Date(
        article.querySelector(".otherl-date time").getAttribute("datetime")
      ),
      thumbnail: article
        .querySelector(".penci-image-holder")
        .getAttribute("data-bgset"),
      source: "Adala News",
    };
  } catch (error) {
    console.error("Error mapping Adala article:", error);
    return null;
  }
}

function mapPlaneteBDArticle(entry) {
  try {
    const title = entry.querySelector("title").textContent.trim();
    const link = entry.querySelector("link").getAttribute("href");
    const rawExcerpt = entry.querySelector("content").textContent.trim();
    const decodedExcerpt = decodeURIComponent(rawExcerpt);
    const author = entry.querySelector("author name").textContent.trim();
    const date = new Date(entry.querySelector("updated").textContent);
    const thumbnailUrl = getThumbnailUrlFromExcerpt(decodedExcerpt);

    return {
      title,
      link: `https://www.planetebd.com${link}`,
      excerpt: formatExcerpt(decodedExcerpt, thumbnailUrl),
      author,
      date: date.toISOString(),
      thumbnail: thumbnailUrl,
      source: decodeURIComponent("Plan%C3%A8te BD"),
    };
  } catch (error) {
    console.error("Error parsing Planète BD entry:", error);
    return null;
  }
}

function getDate(dateString) {
  const [day, month, year] = dateString.split(" ");
  return new Date(`${year}-${getMonthNumber(month)}-${day}`);
}

function getThumbnailUrl(thumbnail) {
  return thumbnail.startsWith("//") ? `https:${thumbnail}` : thumbnail;
}

function getMonthNumber(monthName) {
  const monthNames = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ];
  const monthIndex = monthNames.findIndex((month) =>
    monthName.toLowerCase().startsWith(month)
  );
  return (monthIndex + 1).toString().padStart(2, "0");
}

function getThumbnailUrlFromExcerpt(excerpt) {
  const thumbnailRegex =
    /https:\/\/www\.planetebd\.com\/dynamicImages\/album\/cover\/tiny\/(\d+)\/(\d+)\/album-cover-tiny-(\d+)\.jpg/;
  const thumbnailMatch = excerpt.match(thumbnailRegex);
  const id1 = thumbnailMatch ? thumbnailMatch[1] : "";
  const id2 = thumbnailMatch ? thumbnailMatch[2] : "";
  const id3 = thumbnailMatch ? thumbnailMatch[3] : "";
  return `https://www.planetebd.com/dynamicImages/album/cover/large/${id1}/${id2}/album-cover-large-${id3}.jpg`;
}

function formatExcerpt(excerpt, thumbnailUrl) {
  const thumbnailRegex =
    /https:\/\/www\.planetebd\.com\/dynamicImages\/album\/cover\/tiny\/(\d+)\/(\d+)\/album-cover-tiny-(\d+)\.jpg/;
  return excerpt
    .replace(/<br\s*\/?>/g, "\n")
    .replace(thumbnailRegex, "")
    .replace(/<img[^>]*>/g, "")
    .replace(/&#?\w+;/g, "")
    .replace(/Note\s*:\s*(\d+\/\d+)/i, "\n Note: $1")
    .replace(/Editeur\s*:\s*([^|]+)/i, "| Editeur: $1")
    .replace(/Auteurs?\s*:\s*([^|]+)/i, "| Auteurs: $1")
    .trim();
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
