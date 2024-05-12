// utils.js
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
