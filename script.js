const settings = {
  compression: false,
  detectDuplicates: false,
  saveHistory: false,
  theme: "light",
  colorExtraction: false,
  autoTagging: false,
  imageCropping: false,
  bulkRename: false,
  favorites: [],
  downloadHistory: [],
  compressQuality: 0.8,
};

let selectedImages = new Set();

async function fetchImages() {
  const urlInput = document.getElementById("urlInput");
  const imageGrid = document.getElementById("imageGrid");
  const progress = document.getElementById("progress");
  const stats = document.getElementById("stats");
  const status = document.getElementById("status");
  const imageCount = document.getElementById("imageCount");

  if (!urlInput.value) return;

  const url = urlInput.value;
  const isSinglePost = isPostUrl(url);

  imageGrid.innerHTML = "";
  progress.classList.remove("hidden");
  stats.classList.add("hidden");

  try {
    status.textContent = "Fetching page content...";
    const response = await fetch(
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    );
    const data = await response.json();

    const parser = new DOMParser();
    const doc = parser.parseFromString(data.contents, "text/html");

    let images;
    if (isSinglePost) {
      const mainContent =
        doc.querySelector("article, .post-content, .entry-content, main") ||
        doc.body;
      images = Array.from(mainContent.getElementsByTagName("img"));
    } else {
      images = Array.from(doc.getElementsByTagName("img"));
    }

    const imageUrls = images
      .map((img) => img.src)
      .filter((src) => src && (src.startsWith("http") || src.startsWith("//")))
      .filter(
        (src) =>
          !src.includes("avatar") &&
          !src.includes("logo") &&
          src.match(/\.(jpg|jpeg|png|gif)$/i)
      );

    status.textContent = "Processing images...";

    let uniqueUrls = [...new Set(imageUrls)];
    if (settings.detectDuplicates) {
      uniqueUrls = await removeDuplicateImages(uniqueUrls);
    }
    imageCount.textContent = `${uniqueUrls.length} images found`;

    for (const url of uniqueUrls) {
      const card = await createImageCard(url);
      imageGrid.appendChild(card);
    }

    if (uniqueUrls.length > 0) {
      stats.classList.remove("hidden");
      const downloadAllBtn = document.getElementById("downloadAll");
      const exportExcelBtn = document.getElementById("exportExcel");
      downloadAllBtn.onclick = () => downloadAllImages(uniqueUrls);
      exportExcelBtn.onclick = () => exportToExcel(uniqueUrls);
    }
  } catch (error) {
    console.error("Error:", error);
    imageGrid.innerHTML =
      '<p class="error">Error fetching images. Please try again.</p>';
  }

  progress.classList.add("hidden");
}

function isPostUrl(url) {
  const postPatterns = [
    /\/\d{4}\/\d{2}\//,
    /\/(post|article|blog)\//,
    /\.[a-z]+\/[^\/]+$/,
    /\/[^\/]+\/?$/,
  ];
  return postPatterns.some((pattern) => pattern.test(url));
}

async function exportToExcel(urls) {
  const csvContent = "Image URLs\n" + urls.join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "image_urls.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function createImageCard(url) {
  const card = document.createElement("div");
  card.className = "image-card";

  const imgContainer = document.createElement("div");
  imgContainer.className = "img-container";

  const img = document.createElement("img");
  img.src = url;

  const actions = document.createElement("div");
  actions.className = "image-actions";

  const copyBtn = document.createElement("button");
  copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
  copyBtn.className = "action-btn";
  copyBtn.onclick = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(url);
    showToast("URL copied!");
  };

  const shareBtn = document.createElement("button");
  shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
  shareBtn.className = "action-btn";
  shareBtn.onclick = (e) => {
    e.stopPropagation();
    if (navigator.share) {
      navigator.share({
        title: "Share Image",
        url: url,
      });
    }
  };

  actions.appendChild(copyBtn);
  actions.appendChild(shareBtn);
  imgContainer.appendChild(actions);

  const imageInfo = document.createElement("div");
  imageInfo.className = "image-info";

  const format = url.split(".").pop().toUpperCase();
  const formatBadge = document.createElement("span");
  formatBadge.className = "badge";
  formatBadge.textContent = format;

  try {
    const response = await fetch(url, { method: "HEAD" });
    const size = response.headers.get("content-length");
    if (size) {
      const sizeBadge = document.createElement("span");
      sizeBadge.className = "badge";
      sizeBadge.textContent = `${(size / 1024).toFixed(1)}KB`;
      imageInfo.appendChild(sizeBadge);
    }
  } catch (error) {
    console.error("Error fetching size:", error);
  }

  imageInfo.appendChild(formatBadge);
  imgContainer.appendChild(imageInfo);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "image-selector";
  checkbox.onclick = (e) => {
    e.stopPropagation();
    if (checkbox.checked) {
      selectedImages.add(url);
    } else {
      selectedImages.delete(url);
    }
    updateSelectionCount();
  };

  const footer = document.createElement("div");
  footer.className = "card-footer";

  const downloadBtn = document.createElement("button");
  downloadBtn.className = "download-all";
  downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
  downloadBtn.onclick = () => downloadImage(url);

  imgContainer.appendChild(checkbox);
  imgContainer.appendChild(img);
  footer.appendChild(downloadBtn);
  card.appendChild(imgContainer);
  card.appendChild(footer);

  img.onclick = () => previewImage(url);

  const sizeInfo = document.createElement("div");
  sizeInfo.className = "image-size";
  img.onload = () => {
    sizeInfo.textContent = `${img.naturalWidth}×${img.naturalHeight}px`;
  };

  footer.appendChild(sizeInfo);

  const tooltip = document.createElement("div");
  tooltip.className = "image-tooltip";
  tooltip.textContent = url.split("/").pop();
  card.appendChild(tooltip);

  img.classList.add("skeleton");
  img.onload = () => {
    img.classList.remove("skeleton");
    sizeInfo.textContent = `${img.naturalWidth}×${img.naturalHeight}px`;
  };

  card.tabIndex = 0;
  card.addEventListener("keydown", (e) => {
    if (e.key === " ") previewImage(url);
    if (e.key === "d") downloadImage(url);
    if (e.key === "c") navigator.clipboard.writeText(url);
  });

  if (settings.colorExtraction) {
    const analysis = await analyzeImage(url);
    const colorPalette = document.createElement("div");
    colorPalette.className = "color-palette";
    analysis.colors.forEach((color) => {
      const colorSwatch = document.createElement("div");
      colorSwatch.className = "color-swatch";
      colorSwatch.style.backgroundColor = color;
      colorPalette.appendChild(colorSwatch);
    });
    footer.appendChild(colorPalette);
  }

  const favoriteBtn = document.createElement("button");
  favoriteBtn.className = "action-btn favorite-btn";
  favoriteBtn.innerHTML = settings.favorites.includes(url)
    ? '<i class="fas fa-star"></i>'
    : '<i class="far fa-star"></i>';
  favoriteBtn.onclick = (e) => {
    e.stopPropagation();
    toggleFavorite(url);
    favoriteBtn.innerHTML = settings.favorites.includes(url)
      ? '<i class="fas fa-star"></i>'
      : '<i class="far fa-star"></i>';
  };
  actions.appendChild(favoriteBtn);

  return card;
}

function updateSelectionCount() {
  const stats = document.getElementById("stats");
  const imageCount = document.getElementById("imageCount");
  imageCount.textContent = `${selectedImages.size} selected of ${
    document.querySelectorAll(".image-card").length
  } images`;

  const downloadSelectedBtn = document.getElementById("downloadSelected");
  const exportSelectedBtn = document.getElementById("exportSelected");

  if (selectedImages.size > 0) {
    downloadSelectedBtn.disabled = false;
    exportSelectedBtn.disabled = false;
  } else {
    downloadSelectedBtn.disabled = true;
    exportSelectedBtn.disabled = true;
  }
}

async function downloadImage(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const filename = url.split("/").pop();

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error("Error downloading image:", error);
  }
}

async function downloadAllImages(urls) {
  const progress = document.getElementById("progress");
  const status = document.getElementById("status");
  progress.classList.remove("hidden");

  const zip = new JSZip();

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    status.textContent = `Downloading image ${i + 1} of ${urls.length}...`;

    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const filename = url.split("/").pop();
      zip.file(filename, blob);
    } catch (error) {
      console.error(`Error downloading ${url}:`, error);
    }
  }

  status.textContent = "Creating zip file...";
  const zipBlob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(zipBlob);
  link.download = "images.zip";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  progress.classList.add("hidden");
}

async function downloadSelectedImages() {
  if (selectedImages.size === 0) return;
  await downloadAllImages([...selectedImages]);
}

function exportSelectedToExcel() {
  if (selectedImages.size === 0) return;
  exportToExcel([...selectedImages]);
}

function previewImage(url) {
  const modal = document.createElement("div");
  modal.className = "preview-modal";
  modal.innerHTML = `
        <span class="close-modal">&times;</span>
        <img src="${url}" alt="Preview">
    `;
  modal.onclick = (e) => {
    if (e.target === modal || e.target.className === "close-modal") {
      document.body.removeChild(modal);
    }
  };
  document.body.appendChild(modal);
}

document.getElementById("selectAll").addEventListener("change", (e) => {
  const checkboxes = document.querySelectorAll(".image-selector");
  checkboxes.forEach((checkbox) => {
    checkbox.checked = e.target.checked;
    const url = checkbox.closest(".image-card").querySelector("img").src;
    if (e.target.checked) {
      selectedImages.add(url);
    } else {
      selectedImages.delete(url);
    }
  });
  updateSelectionCount();
});

document.getElementById("sizeFilter").addEventListener("change", (e) => {
  const cards = document.querySelectorAll(".image-card");
  cards.forEach((card) => {
    const img = card.querySelector("img");
    const width = img.naturalWidth;

    switch (e.target.value) {
      case "large":
        card.style.display = width >= 1000 ? "" : "none";
        break;
      case "medium":
        card.style.display = width >= 500 && width < 1000 ? "" : "none";
        break;
      case "small":
        card.style.display = width < 500 ? "" : "none";
        break;
      default:
        card.style.display = "";
    }
  });
});

document.getElementById("imageSearch").addEventListener("input", (e) => {
  const searchTerm = e.target.value.toLowerCase();
  const cards = document.querySelectorAll(".image-card");

  cards.forEach((card) => {
    const imgUrl = card.querySelector("img").src.toLowerCase();
    const imgSize = card.querySelector(".image-size").textContent;
    if (imgUrl.includes(searchTerm) || imgSize.includes(searchTerm)) {
      card.style.display = "";
    } else {
      card.style.display = "none";
    }
  });
});

document.getElementById("gridView").onclick = function () {
  document.getElementById("imageGrid").className = "";
  this.classList.add("active");
  document.getElementById("listView").classList.remove("active");
};

document.getElementById("listView").onclick = function () {
  document.getElementById("imageGrid").className = "list-view";
  this.classList.add("active");
  document.getElementById("gridView").classList.remove("active");
};

document.getElementById("sortImages").addEventListener("change", (e) => {
  const cards = Array.from(document.querySelectorAll(".image-card"));
  const grid = document.getElementById("imageGrid");

  cards.sort((a, b) => {
    switch (e.target.value) {
      case "size":
        const sizeA = parseInt(a.querySelector("img").src.length);
        const sizeB = parseInt(b.querySelector("img").src.length);
        return sizeB - sizeA;
      case "dimension":
        const dimA = parseInt(a.querySelector(".image-size").textContent);
        const dimB = parseInt(b.querySelector(".image-size").textContent);
        return dimB - dimA;
      case "name":
        return a
          .querySelector("img")
          .src.localeCompare(b.querySelector("img").src);
    }
  });

  grid.innerHTML = "";
  cards.forEach((card) => grid.appendChild(card));
});

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2000);
}

document.getElementById("themeToggle").addEventListener("click", () => {
  const theme =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "light"
      : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  settings.theme = theme;
  saveSettings();
});

function saveSettings() {
  localStorage.setItem("imageDownloaderSettings", JSON.stringify(settings));
}

function loadSettings() {
  const saved = localStorage.getItem("imageDownloaderSettings");
  if (saved) {
    Object.assign(settings, JSON.parse(saved));
    applySettings();
  }
}

function applySettings() {
  document.documentElement.setAttribute("data-theme", settings.theme);
  document.getElementById("enableCompression").checked = settings.compression;
  document.getElementById("detectDuplicates").checked =
    settings.detectDuplicates;
  document.getElementById("saveHistory").checked = settings.saveHistory;
}

async function removeDuplicateImages(urls) {
  const hashes = new Map();
  const unique = [];

  for (const url of urls) {
    const hash = await getImageHash(url);
    if (!hashes.has(hash)) {
      hashes.set(hash, url);
      unique.push(url);
    }
  }

  return unique;
}

async function getImageHash(url) {
  const img = document.createElement("img");
  img.crossOrigin = "Anonymous";
  return new Promise((resolve) => {
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, 8, 8);
      const data = ctx.getImageData(0, 0, 8, 8).data;
      let hash = "";
      for (let i = 0; i < data.length; i += 4) {
        hash += (data[i] + data[i + 1] + data[i + 2]) / 3 > 127 ? "1" : "0";
      }
      resolve(hash);
    };
    img.src = url;
  });
}

async function analyzeImage(url) {
  const img = new Image();
  img.crossOrigin = "Anonymous";
  return new Promise((resolve) => {
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      ).data;
      const colors = extractDominantColors(imageData);

      const brightness = calculateBrightness(imageData);

      resolve({
        dimensions: { width: img.width, height: img.height },
        colors: colors,
        brightness: brightness,
        aspectRatio: (img.width / img.height).toFixed(2),
      });
    };
    img.src = url;
  });
}

function extractDominantColors(imageData) {
  const colorMap = new Map();
  for (let i = 0; i < imageData.length; i += 4) {
    const color = `rgb(${imageData[i]},${imageData[i + 1]},${
      imageData[i + 2]
    })`;
    colorMap.set(color, (colorMap.get(color) || 0) + 1);
  }
  return Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([color]) => color);
}

function toggleFavorite(url) {
  const index = settings.favorites.indexOf(url);
  if (index === -1) {
    settings.favorites.push(url);
  } else {
    settings.favorites.splice(index, 1);
  }
  saveSettings();
}

async function bulkRename(prefix) {
  const cards = document.querySelectorAll(".image-card");
  let counter = 1;

  cards.forEach((card) => {
    const url = card.querySelector("img").src;
    const ext = url.split(".").pop();
    const newName = `${prefix}_${counter}.${ext}`;
    counter++;

    const tooltip = card.querySelector(".image-tooltip");
    if (tooltip) tooltip.textContent = newName;
  });
}

document.addEventListener("DOMContentLoaded", loadSettings);

const effects = {
  grayscale: (ctx, canvas) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = data[i + 1] = data[i + 2] = avg;
    }
    ctx.putImageData(imageData, 0, 0);
  },

  sepia: (ctx, canvas) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      data[i] = r * 0.393 + g * 0.769 + b * 0.189;
      data[i + 1] = r * 0.349 + g * 0.686 + b * 0.168;
      data[i + 2] = r * 0.272 + g * 0.534 + b * 0.131;
    }
    ctx.putImageData(imageData, 0, 0);
  },
};

function addTouchSupport(element) {
  let touchStartX = 0;
  let touchStartY = 0;

  element.addEventListener("touchstart", (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  });

  element.addEventListener("touchend", (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 50) {
        showPreviousImage();
      } else if (deltaX < -50) {
        showNextImage();
      }
    }
  });
}

async function optimizeImage(url, quality = 0.8) {
  const img = new Image();
  img.crossOrigin = "Anonymous";

  return new Promise((resolve) => {
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;

      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = url;
  });
}

function generateQRCode(url) {
  const qrContainer = document.createElement("div");
  new QRCode(qrContainer, {
    text: url,
    width: 128,
    height: 128,
  });
  return qrContainer;
}

function calculateImageStats(images) {
  return {
    total: images.length,
    formats: images.reduce((acc, img) => {
      const format = img.src.split(".").pop().toLowerCase();
      acc[format] = (acc[format] || 0) + 1;
      return acc;
    }, {}),
    averageSize:
      images.reduce(
        (acc, img) => acc + img.naturalWidth * img.naturalHeight,
        0
      ) / images.length,
    largestImage: images.reduce(
      (acc, img) => {
        const size = img.naturalWidth * img.naturalHeight;
        return size > acc.size ? { size, url: img.src } : acc;
      },
      { size: 0, url: "" }
    ),
  };
}

async function exportToPDF(images) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 10;

  for (const url of images) {
    try {
      const img = await loadImage(url);
      const aspectRatio = img.width / img.height;
      const width = 190;
      const height = width / aspectRatio;

      if (y + height > 280) {
        doc.addPage();
        y = 10;
      }

      doc.addImage(img, "JPEG", 10, y, width, height);
      y += height + 10;
    } catch (error) {
      console.error("Error adding image to PDF:", error);
    }
  }

  doc.save("images.pdf");
}

function createComparisonView(image1, image2) {
  const container = document.createElement("div");
  container.className = "comparison-container";
  container.innerHTML = `
        <div class="comparison-slider">
            <div class="comparison-before">
                <img src="${image1}" alt="Before">
            </div>
            <div class="comparison-after">
                <img src="${image2}" alt="After">
            </div>
            <div class="comparison-handle"></div>
        </div>
    `;
  return container;
}

class ImageCarousel {
  constructor(container, images) {
    this.container = container;
    this.images = images;
    this.currentIndex = 0;
    this.init();
  }

  init() {
    this.container.className = "carousel-view";
    this.container.innerHTML = `
            <div class="carousel-inner">
                ${this.images
                  .map(
                    (url) => `
                    <div class="carousel-item">
                        <img src="${url}" alt="Carousel Image">
                    </div>
                `
                  )
                  .join("")}
            </div>
            <div class="carousel-nav">
                ${this.images
                  .map(
                    (_, i) => `
                    <div class="carousel-dot ${i === 0 ? "active" : ""}"></div>
                `
                  )
                  .join("")}
            </div>
        `;

    this.setupNavigation();
  }

  setupNavigation() {
    const dots = this.container.querySelectorAll(".carousel-dot");
    dots.forEach((dot, i) => {
      dot.addEventListener("click", () => this.goToSlide(i));
    });

    let touchStartX = 0;
    this.container.addEventListener("touchstart", (e) => {
      touchStartX = e.touches[0].clientX;
    });

    this.container.addEventListener("touchend", (e) => {
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > 50) {
        if (diff > 0) this.next();
        else this.prev();
      }
    });
  }

  goToSlide(index) {
    this.currentIndex = index;
    const inner = this.container.querySelector(".carousel-inner");
    inner.style.transform = `translateX(-${index * 100}%)`;

    const dots = this.container.querySelectorAll(".carousel-dot");
    dots.forEach((dot, i) => {
      dot.classList.toggle("active", i === index);
    });
  }

  next() {
    this.goToSlide((this.currentIndex + 1) % this.images.length);
  }

  prev() {
    this.goToSlide(
      (this.currentIndex - 1 + this.images.length) % this.images.length
    );
  }
}

async function extractMetadata(url) {
  const img = new Image();
  img.crossOrigin = "Anonymous";

  return new Promise((resolve) => {
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      EXIF.getData(img, function () {
        resolve({
          dimensions: `${img.width}×${img.height}`,
          aspectRatio: (img.width / img.height).toFixed(2),
          dateTime: EXIF.getTag(this, "DateTime"),
          make: EXIF.getTag(this, "Make"),
          model: EXIF.getTag(this, "Model"),
          iso: EXIF.getTag(this, "ISOSpeedRatings"),
          focalLength: EXIF.getTag(this, "FocalLength"),
          exposure: EXIF.getTag(this, "ExposureTime"),
        });
      });
    };
    img.src = url;
  });
}

async function initImageRecognition() {
  const model = await mobilenet.load();
  return model;
}

async function classifyImage(url) {
  const model = await initImageRecognition();
  const img = document.createElement("img");
  img.crossOrigin = "Anonymous";
  img.src = url;

  return new Promise((resolve) => {
    img.onload = async () => {
      const predictions = await model.classify(img);
      resolve(predictions);
    };
  });
}

async function detectFaces(url) {
  const model = await faceapi.loadSsdMobilenetv1Model("/models");
  const img = await faceapi.fetchImage(url);
  const detections = await faceapi.detectAllFaces(img);
  return detections;
}

const imageEnhancements = {
  sharpen: (ctx, canvas) => {
    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    applyConvolution(ctx, canvas, kernel);
  },

  brighten: (ctx, canvas, factor = 1.2) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * factor);
      data[i + 1] = Math.min(255, data[i + 1] * factor);
      data[i + 2] = Math.min(255, data[i + 2] * factor);
    }

    ctx.putImageData(imageData, 0, 0);
  },
};

function analyzeImages() {
  const images = document.querySelectorAll(".image-card img");
  let totalSize = 0;
  let formats = {};

  images.forEach(async (img) => {
    totalSize += img.naturalWidth * img.naturalHeight;
    const format = img.src.split(".").pop().toLowerCase();
    formats[format] = (formats[format] || 0) + 1;

    document.getElementById("totalImages").textContent = images.length;
    document.getElementById("totalSize").textContent = `${Math.round(
      totalSize / 1024
    )} KB`;

    const formatStats = Object.entries(formats)
      .map(([format, count]) => `${format.toUpperCase()}: ${count}`)
      .join(", ");
    document.getElementById("formatStats").textContent = formatStats;

    if (settings.autoTagging) {
      const predictions = await classifyImage(img.src);
      showImageTags(img, predictions);
    }
  });
}

function detectFacesInImages() {
  const images = document.querySelectorAll(".image-card img");
  images.forEach(async (img) => {
    try {
      const faces = await detectFaces(img.src);
      if (faces.length > 0) {
        const badge = document.createElement("div");
        badge.className = "badge face-badge";
        badge.textContent = `${faces.length} faces`;
        img.parentElement.appendChild(badge);
      }
    } catch (error) {
      console.error("Face detection error:", error);
    }
  });
}

function enhanceImages() {
  const images = document.querySelectorAll(".image-card img");
  images.forEach(async (img) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    ctx.drawImage(img, 0, 0);
    imageEnhancements.brighten(ctx, canvas);
    img.src = canvas.toDataURL("image/jpeg", settings.compressQuality);
  });
}

function batchResize() {
  const width = prompt("Enter target width in pixels:", "800");
  if (!width) return;

  const images = document.querySelectorAll(".image-card img");
  images.forEach((img) => {
    const aspectRatio = img.naturalHeight / img.naturalWidth;
    const height = Math.round(width * aspectRatio);
    resizeImage(img, parseInt(width), height);
  });
}

function batchWatermark() {
  const text = prompt("Enter watermark text:", "© Your Name");
  if (!text) return;

  const images = document.querySelectorAll(".image-card img");
  images.forEach((img) => {
    addWatermark(img, text);
  });
}

function batchOptimize() {
  const images = document.querySelectorAll(".image-card img");
  images.forEach(async (img) => {
    const optimized = await optimizeImage(img.src, settings.compressQuality);
    img.src = optimized;
  });
}

function resizeImage(img, targetWidth, targetHeight) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  img.src = canvas.toDataURL("image/jpeg", settings.compressQuality);
}

function addWatermark(img, text) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  ctx.drawImage(img, 0, 0);
  ctx.font = "24px Arial";
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height - 30);

  img.src = canvas.toDataURL("image/jpeg", settings.compressQuality);
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  const actionBtn = document.getElementById("actionBtn");
  const actionMenu = document.getElementById("actionMenu");
  if (actionBtn && actionMenu) {
    actionBtn.onclick = () => {
      actionMenu.classList.toggle("hidden");
    };
  }

  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  if (settingsBtn && settingsModal) {
    settingsBtn.onclick = () => {
      settingsModal.classList.toggle("hidden");
    };
  }

  const qualitySlider = document.getElementById("compressQuality");
  const qualityValue = document.getElementById("qualityValue");
  if (qualitySlider && qualityValue) {
    qualitySlider.oninput = () => {
      const value = Math.round(qualitySlider.value * 100);
      qualityValue.textContent = `${value}%`;
      settings.compressQuality = qualitySlider.value;
    };
  }
});

function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;
  document.getElementById("imageGrid").appendChild(errorDiv);
}
