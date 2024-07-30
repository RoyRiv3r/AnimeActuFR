// background.js
async function updateRefreshInterval() {
  try {
    const settings = await browser.storage.sync.get({ refreshInterval: 10 });
    refreshInterval = settings.refreshInterval * 60 * 1000;
    // console.log("Refresh interval updated to:", refreshInterval);
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

async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("newsDB", 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("articles")) {
        db.createObjectStore("articles", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("lastFetchTime")) {
        db.createObjectStore("lastFetchTime", { keyPath: "source" });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error("Error opening IndexedDB:", event.target.error);
      reject(event.target.error);
    };
  });
}

async function saveLastFetchTimeToCache(lastFetchTime) {
  const db = await openIndexedDB();
  const transaction = db.transaction("lastFetchTime", "readwrite");
  const store = transaction.objectStore("lastFetchTime");

  for (const [source, date] of Object.entries(lastFetchTime)) {
    store.put({ source, date });
  }

  return transaction.complete;
}

async function getLastFetchTimeFromCache() {
  const db = await openIndexedDB();
  const transaction = db.transaction("lastFetchTime", "readonly");
  const store = transaction.objectStore("lastFetchTime");

  return new Promise((resolve, reject) => {
    const request = store.getAll();

    request.onsuccess = (event) => {
      const result = event.target.result;
      const lastFetchTime = {};
      result.forEach((item) => {
        lastFetchTime[item.source] = item.date;
      });
      resolve(lastFetchTime);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function saveArticlesToCache(articles) {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction("articles", "readwrite");
    const store = transaction.objectStore("articles");

    articles.forEach((article) => {
      store.put(article);
    });

    return transaction.complete;
  } catch (error) {
    console.error("Error saving articles to cache:", error);
  }
}

async function getArticlesFromCache() {
  try {
    const db = await openIndexedDB();
    const transaction = db.transaction("articles", "readonly");
    const store = transaction.objectStore("articles");

    return new Promise((resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = (event) => {
        const articles = event.target.result;
        // console.log(`Retrieved ${articles.length} articles from cache`);
        resolve(articles);
      };

      request.onerror = (event) => {
        console.error("Error getting articles from cache:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error("Error opening IndexedDB:", error);
    return [];
  }
}

async function checkForNewArticles() {
  // console.log("Checking for new articles...");
  const settings = await browser.storage.sync.get({
    notificationCount: 3,
    notifyAnimotaku: true,
    notifyAdala: true,
    notifyPlaneteBD: true,
    notifyAnimeNewsNetwork: true,
    notifyCBR: true,
    notifyTokyoOtakuMode: true,
    // enableNotifications: false,
  });

  const fetchPromises = [];

  if (settings.notifyAnimotaku) {
    fetchPromises.push(
      Promise.all([
        fetchNews(
          "Animotaku",
          "https://animotaku.fr/category/actualite/",
          ".elementor-post",
          mapAnimotakuArticle
        ),
        fetchRSSFeed("https://animotaku.fr/feed/"),
      ]).then(([scrapedArticles, rssArticles]) => {
        return mergeAnimotakuData(scrapedArticles, rssArticles);
      })
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

  if (settings.notifyAnimeNewsNetwork) {
    fetchPromises.push(
      fetchAnimeNewsNetworkFeed(
        "https://api.feedly.com/v3/mixes/contents?streamId=feed/http://www.animenewsnetwork.com/newsfeed/rss.xml&count=15&hours=16&ck=1720967487339&ct=feedly.desktop&cv=31.0.2333"
      )
    );
  }

  if (settings.notifyTokyoOtakuMode) {
    fetchPromises.push(
      fetchTokyoOtakuModeFeed("https://otakumode.com/news/feed")
    );
  }

  if (settings.notifyCBR) {
    fetchPromises.push(
      fetchCBRFeed("https://www.cbr.com/feed/category/anime/")
    );
  }

  const allArticles = (await Promise.all(fetchPromises)).flat();
  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Save the updated articles to the cache
  try {
    await saveArticlesToCache(allArticles);
    // console.log("Cached articles updated.");
  } catch (error) {
    console.error("Error saving cached articles:", error);
  }

  const lastFetchTime = await getLastFetchTimeFromCache();

  const newArticles = allArticles.filter((article) => {
    const lastFetchTimeForSource = lastFetchTime[article.source];
    const articleDate = new Date(article.date);

    if (!lastFetchTimeForSource) {
      return true;
    }

    const lastFetchDate = new Date(lastFetchTimeForSource);

    if (article.source === "Anime News Network") {
      return articleDate > lastFetchDate;
    } else if (article.source === "Animotaku") {
      const animotakuArticleDate = new Date(articleDate.setHours(0, 0, 0, 0));
      const animotakuLastFetchDate = new Date(
        lastFetchDate.setHours(0, 0, 0, 0)
      );
      return animotakuArticleDate > animotakuLastFetchDate;
    } else if (article.source === "Tokyo Otaku Mode News") {
      return articleDate > lastFetchDate;
    } else {
      return articleDate > lastFetchDate;
    }
  });

  const latestNewArticles = newArticles.slice(0, settings.notificationCount);

  await updateBadgeCount(newArticles.length);

  const { enableNotifications } = await browser.storage.sync.get({
    enableNotifications: true,
  });

  if (!enableNotifications) {
    // console.log("Notifications are disabled. Skipping showing notifications.");
    return;
  }

  for (const article of latestNewArticles) {
    showNotification(article);
    lastFetchTime[article.source] = article.date;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  for (const source of [
    "Animotaku",
    "Adala News",
    "Planète BD",
    "Anime News Network",
    "Tokyo Otaku Mode News",
    "CBR",
  ]) {
    const latestArticle = allArticles.find(
      (article) => article.source === source
    );
    if (latestArticle) {
      lastFetchTime[source] = latestArticle.date;
    }
  }

  try {
    await saveLastFetchTimeToCache(lastFetchTime);
  } catch (error) {
    console.error("Error saving lastFetchTime:", error);
  }
}

function mergeAnimotakuData(scrapedArticles, rssArticles) {
  return scrapedArticles.map((scrapedArticle) => {
    try {
      const matchingRssArticle = rssArticles.find(
        (rssArticle) => rssArticle.link === scrapedArticle.link
      );
      if (matchingRssArticle) {
        return {
          ...scrapedArticle,
          category: matchingRssArticle.category,
          guid: matchingRssArticle.guid,
          description: matchingRssArticle.description,

          date:
            matchingRssArticle.pubDate &&
            !isNaN(matchingRssArticle.pubDate.getTime())
              ? matchingRssArticle.pubDate.toISOString()
              : scrapedArticle.date,
        };
      }
      return scrapedArticle;
    } catch (error) {
      console.error("Error merging Animotaku data:", error);
      return scrapedArticle;
    }
  });
}
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substr(0, maxLength - 3) + "...";
}

function showNotification(article) {
  const notificationId = `anime-news-${Date.now()}`;

  // console.log("Showing notification for article:", article);

  const truncatedTitle = article.title;
  let cleanExcerpt = article.excerpt;
  if (article.source === "Anime News Network") {
    cleanExcerpt = cleanExcerpt.replace(/<cite>|<\/cite>/g, "");
  }

  const maxExcerptLength = 109;
  const truncatedExcerpt = truncateText(cleanExcerpt, maxExcerptLength);
  const excerptWithSource = `${truncatedExcerpt}\n(${article.source})`;

  try {
    browser.notifications.create(notificationId, {
      type: "basic",
      iconUrl: article.thumbnail || "default_icon.png",
      title: truncatedTitle,
      message: excerptWithSource,
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

let intervalId;
async function startInterval() {
  const settings = await browser.storage.sync.get({ refreshInterval: 10 });
  clearInterval(intervalId);
  intervalId = setInterval(
    checkForNewArticles,
    settings.refreshInterval * 60 * 1000
  );
  // console.log("Interval started with interval:", settings.refreshInterval);
}
startInterval();

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.refreshInterval) {
    startInterval();
  }
});

async function updateBadgeCount(count) {
  try {
    const { badgeCount = 0 } = await browser.storage.local.get("badgeCount");
    const newBadgeCount = badgeCount + count;
    await browser.storage.local.set({ badgeCount: newBadgeCount });
    await browser.browserAction.setBadgeText({
      text: newBadgeCount.toString(),
    });
    await browser.browserAction.setBadgeBackgroundColor({ color: "orange" });
  } catch (error) {
    console.error("Error updating badge count:", error);
  }
}

async function resetBadgeCount() {
  try {
    await browser.storage.local.remove("badgeCount");
    await browser.browserAction.setBadgeText({ text: "0" });
  } catch (error) {
    console.error("Error resetting badge count:", error);
  }
}
browser.browserAction.onClicked.addListener(async () => {
  await resetBadgeCount();
});

browser.runtime.onMessage.addListener((message) => {
  if (message.action === "resetBadgeCount") {
    resetBadgeCount();
  }
});
checkForNewArticles();
