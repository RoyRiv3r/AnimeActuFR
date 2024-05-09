async function updateRefreshInterval() {
  try {
    const settings = await browser.storage.sync.get({ refreshInterval: 10 });
    refreshInterval = settings.refreshInterval * 60 * 1000;
    console.log("Refresh interval updated to:", refreshInterval);
  } catch (error) {
    console.error("Error updating refresh interval:", error);
  }
}

updateRefreshInterval();

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.refreshInterval) {
    updateRefreshInterval();
  }
});

let lastFetchTime = {};

browser.storage.local.get("lastFetchTime").then((data) => {
  if (data.lastFetchTime) {
    lastFetchTime = data.lastFetchTime;
  }
});

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

async function checkForNewArticles() {
  console.log("Checking for new articles...");
  const settings = await browser.storage.sync.get({
    notificationCount: 6,
    notifyAnimotaku: true,
    notifyAdala: true,
    notifyPlaneteBD: true,
    enableNotifications: true,
  });

  const fetchPromises = [];

  if (settings.notifyAnimotaku) {
    fetchPromises.push(
      fetchNews(
        "Animotaku",
        "https://animotaku.fr/category/actualite/",
        ".elementor-post",
        mapAnimotakuArticle
      )
    );
  }

  if (settings.notifyAdala) {
    fetchPromises.push(
      fetchNews(
        "Adala News",
        "https://adala-news.fr/",
        ".list-post",
        mapAdalaArticle
      )
    );
  }

  if (settings.notifyPlaneteBD) {
    fetchPromises.push(
      fetchNews(
        "Planète BD",
        "https://www.planetebd.com/planete-bd/manga",
        "entry",
        mapPlaneteBDArticle
      )
    );
  }

  const allArticles = (await Promise.all(fetchPromises)).flat();
  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Save the updated articles to the cache
  try {
    await browser.storage.local.set({ cachedArticles: allArticles });
    console.log("Cached articles updated.");
  } catch (error) {
    console.error("Error saving cached articles:", error);
  }

  const newArticles = allArticles.filter((article) => {
    const lastFetchTimeForSource = lastFetchTime[article.source];
    return (
      !lastFetchTimeForSource ||
      new Date(article.date) > new Date(lastFetchTimeForSource)
    );
  });

  const latestNewArticles = newArticles.slice(0, settings.notificationCount);

  const { enableNotifications } = await browser.storage.sync.get({
    enableNotifications: true,
  });

  if (!enableNotifications) {
    console.log("Notifications are disabled. Skipping showing notifications.");
    return;
  }

  for (const article of latestNewArticles) {
    showNotification(article);
    lastFetchTime[article.source] = article.date;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  for (const source of ["Animotaku", "Adala News", "Planète BD"]) {
    const latestArticle = allArticles.find(
      (article) => article.source === source
    );
    if (latestArticle) {
      lastFetchTime[source] = latestArticle.date;
    }
  }

  try {
    browser.storage.local.set({ lastFetchTime });
  } catch (error) {
    console.error("Error saving lastFetchTime:", error);
  }
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
      source: "Planète BD",
    };
  } catch (error) {
    console.error("Error parsing Planète BD entry:", error);
    return null;
  }
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

function showNotification(article) {
  const notificationId = `animotaku-adala-news-${Date.now()}`;

  const truncatedTitle = article.title.split(" ").slice(0, 6).join(" ");
  const titleWithSource = `${truncatedTitle}${
    article.title.split(" ").length > 6 ? "..." : ""
  } \n(${article.source})`;

  console.log(`Showing notification for ${article.title}`);
  try {
    browser.notifications.create(notificationId, {
      type: "basic",
      iconUrl: article.thumbnail,
      title: titleWithSource,
      message: article.excerpt,
    });
  } catch (error) {
    console.error("Error showing notification:", error);
  }

  localStorage.setItem(notificationId, article.link);
}

browser.notifications.onClicked.addListener(function (notificationId) {
  const articleLink = localStorage.getItem(notificationId);
  if (articleLink) {
    try {
      browser.tabs.create({ url: articleLink });
    } catch (error) {
      console.error("Error opening tab:", error);
    }
  }
});

checkForNewArticles();

let intervalId;
async function startInterval() {
  const settings = await browser.storage.sync.get({ refreshInterval: 10 });
  clearInterval(intervalId);
  intervalId = setInterval(
    checkForNewArticles,
    settings.refreshInterval * 60 * 1000
  );
  console.log("Interval started with interval:", settings.refreshInterval);
}
startInterval();

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.refreshInterval) {
    startInterval();
  }
});
