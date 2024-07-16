// utils.js
async function fetchNews(source, url, selector, mapper) {
  try {
    console.log(`Fetching news from ${source}...`);
    const response = await fetch(url);
    const data = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(data, "text/html");
    const articles = Array.from(doc.querySelectorAll(selector));
    const fetchTime = new Date();

    const mappedArticles = articles
      .map((article) => mapper(article, fetchTime))
      .filter((article) => article !== null);

    console.log(`Fetched ${mappedArticles.length} articles from ${source}`);
    return mappedArticles;
  } catch (error) {
    console.error(`Error fetching ${source} news:`, error);
    return [];
  }
}

async function fetchRSSFeed(url) {
  try {
    const response = await fetch(url);
    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const items = xmlDoc.querySelectorAll("item");

    return Array.from(items)
      .map((item) => {
        const getElementText = (selector) => {
          const element = item.querySelector(selector);
          return element ? element.textContent : "";
        };

        return {
          title: getElementText("title"),
          link: getElementText("link"),
          pubDate: new Date(getElementText("pubDate")),
          creator: getElementText("dc\\:creator") || getElementText("author"),
          category: Array.from(item.querySelectorAll("category")).map(
            (cat) => cat.textContent
          ),
          guid: getElementText("guid"),
          description: getElementText("description"),
        };
      })
      .filter((item) => item.title && item.link);
  } catch (error) {
    console.error("Error fetching RSS feed:", error);
    return [];
  }
}

function getAnimotakuDate(dateString, fetchTime) {
  try {
    const [day, month, yearStr] = dateString.split(" ");
    const year = parseInt(yearStr, 10);
    const monthNumber = getMonthNumber(month);

    if (!monthNumber || isNaN(year)) {
      console.error(`Invalid month or year in date string: ${dateString}`);
      return fetchTime.toISOString();
    }

    const paddedDay = day.padStart(2, "0");

    const articleDate = new Date(
      `${year}-${monthNumber}-${paddedDay}T00:00:00`
    );

    if (isNaN(articleDate.getTime())) {
      console.error(`Invalid date: ${dateString}`);
      return fetchTime.toISOString();
    }

    if (articleDate > fetchTime) {
      console.warn(`Future date detected: ${dateString}. Using current time.`);
      return fetchTime.toISOString();
    }

    if (articleDate.toDateString() === fetchTime.toDateString()) {
      return fetchTime.toISOString();
    }

    return new Date(
      `${year}-${monthNumber}-${paddedDay}T23:59:59`
    ).toISOString();
  } catch (error) {
    console.error(`Error parsing date: ${dateString}`, error);
    return fetchTime.toISOString();
  }
}

function mapAnimotakuArticle(article) {
  try {
    const fetchTime = new Date();
    const thumbnailImg = article.querySelector(
      ".elementor-post__thumbnail img"
    );
    const thumbnailSrc = thumbnailImg
      ? thumbnailImg.getAttribute("data-lazy-src") ||
        thumbnailImg.getAttribute("src")
      : null;

    return {
      id: article.querySelector(".elementor-post__title a").href,
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
      date: getAnimotakuDate(
        article.querySelector(".elementor-post-date").textContent.trim(),
        fetchTime
      ),
      thumbnail: thumbnailSrc ? getThumbnailUrl(thumbnailSrc) : null,
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
      id: article.querySelector(".penci-entry-title a").href,
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

function formatExcerpt(excerpt, thumbnailUrl) {
  let cleanExcerpt = excerpt
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (thumbnailUrl) {
    cleanExcerpt = cleanExcerpt.replace(thumbnailUrl, "").trim();
  }

  const noteIndex = cleanExcerpt.indexOf("Note :");
  if (noteIndex !== -1) {
    cleanExcerpt = cleanExcerpt.substring(0, noteIndex).trim();
  }

  cleanExcerpt = cleanExcerpt.replace(/\.$/, "");

  return cleanExcerpt;
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
      id: link,
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

async function fetchAnimeNewsNetworkFeed(url) {
  try {
    console.log("Fetching Anime News Network feed...");
    const response = await fetch(url);
    const data = await response.json();
    const mappedArticles = data.items
      .map((item) => {
        try {
          return {
            id: item.id,
            title: item.title,
            link: item.alternate?.[[1]]?.href || item.canonicalUrl || "",
            excerpt: item.summary?.content || "",
            author: "Anime News Network",
            date: new Date(item.published).toISOString(),
            thumbnail: item.visual?.url || "",
            source: "Anime News Network",
          };
        } catch (error) {
          console.error("Error mapping Anime News Network article:", error);
          return null;
        }
      })
      .filter((article) => article !== null);
    console.log(
      `Fetched ${mappedArticles.length} articles from Anime News Network`
    );
    return mappedArticles;
  } catch (error) {
    console.error("Error fetching Anime News Network feed:", error);
    return [];
  }
}

async function fetchTokyoOtakuModeFeed(url) {
  try {
    console.log("Fetching Tokyo Otaku Mode News feed...");
    const response = await fetch(url);
    const xmlText = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const items = xmlDoc.querySelectorAll("item");

    const mappedArticles = Array.from(items)
      .map((item) => {
        try {
          const getElementText = (selector) => {
            const element = item.querySelector(selector);
            return element ? element.textContent : "";
          };

          const thumbnailElement = item.querySelector(
            "media\\:content, content"
          );
          const thumbnailUrl = thumbnailElement
            ? thumbnailElement.getAttribute("url")
            : "";

          const pubDate = new Date(getElementText("pubDate"));

          return {
            id: getElementText("guid"),
            title: getElementText("title"),
            link: getElementText("link"),
            excerpt: getElementText("description"),
            author: "Tokyo Otaku Mode",
            date: isNaN(pubDate.getTime())
              ? new Date().toISOString()
              : pubDate.toISOString(),
            thumbnail: thumbnailUrl,
            source: "Tokyo Otaku Mode News",
          };
        } catch (error) {
          console.error("Error mapping Tokyo Otaku Mode News article:", error);
          return null;
        }
      })
      .filter((article) => article !== null);

    console.log(
      `Fetched ${mappedArticles.length} articles from Tokyo Otaku Mode News`
    );
    return mappedArticles;
  } catch (error) {
    console.error("Error fetching Tokyo Otaku Mode News feed:", error);
    return [];
  }
}

function getDate(dateString, source) {
  const [day, month, year] = dateString.split(" ");
  if (source === "Animotaku") {
    return new Date(`${year}-${getMonthNumber(month)}-${day}T23:59:59`);
  } else {
    const [time = "00:00"] = dateString.split(" ").slice(-1);
    return new Date(`${year}-${getMonthNumber(month)}-${day}T${time}`);
  }
}

function getThumbnailUrl(thumbnail) {
  if (!thumbnail) return null;
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
    monthName.toLowerCase().startsWith(month.toLowerCase())
  );
  return monthIndex !== -1
    ? (monthIndex + 1).toString().padStart(2, "0")
    : null;
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
