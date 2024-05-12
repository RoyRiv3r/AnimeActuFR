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

  // Update the badge count

  await updateBadgeCount(newArticles.length);

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
  const settings = await browser.storage.sync.get({ refreshInterval: 1 });
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
