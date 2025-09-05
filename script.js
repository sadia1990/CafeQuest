let map, placesService, infoWindow;
let markers = [];
let pagination = null;

async function initMap() {
  // Load libraries on demand (modern pattern)
  const { Map } = await google.maps.importLibrary("maps");
  await google.maps.importLibrary("places"); // enables google.maps.places.*
  infoWindow = new google.maps.InfoWindow();

  // Default center (Mumbai) in case geolocation/Autocomplete hasn’t run yet.
  const defaultCenter = { lat: 19.0760, lng: 72.8777 };

  map = new Map(document.getElementById("map"), {
    center: defaultCenter,
    zoom: 14,
    mapId: "DEMO_MAP_ID", // optional; remove if you don’t use Cloud Map Styles
  });

  placesService = new google.maps.places.PlacesService(map);

  // Wire up Autocomplete for area search
  const input = document.getElementById("searchInput");
  const ac = new google.maps.places.Autocomplete(input, {
    fields: ["geometry", "name"],
    types: ["geocode"], // searching areas/addresses
  });
  ac.addListener("place_changed", () => {
    const place = ac.getPlace();
    if (place?.geometry?.location) {
      map.panTo(place.geometry.location);
      map.setZoom(15);
      runNearbySearch();
    }
  });

  // Buttons
  document.getElementById("searchBtn").addEventListener("click", runNearbySearch);
  document.getElementById("locateBtn").addEventListener("click", locateUser);
  document.getElementById("nextPage").addEventListener("click", () => paginate(1));
  document.getElementById("prevPage").addEventListener("click", () => paginate(-1));

  // Optional: kick off with user location
  locateUser({ silent: true });
}

// Use browser geolocation
function locateUser(opts = {}) {
  if (!navigator.geolocation) {
    if (!opts.silent) setStatus("Geolocation not supported.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.panTo(loc);
      map.setZoom(15);
      runNearbySearch();
    },
    (err) => {
      if (!opts.silent) setStatus("Could not get your location: " + err.message);
      runNearbySearch(); // Still search around default center
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function setStatus(msg) {
  document.getElementById("status").textContent = msg;
}

function clearMarkers() {
  markers.forEach(m => m.setMap(null));
  markers = [];
}

function addMarker(place) {
  const marker = new google.maps.Marker({
    map,
    position: place.geometry.location,
    title: place.name
  });
  marker.addListener("click", () => {
    const addr = place.vicinity || place.formatted_address || "";
    const rating = place.rating ? `⭐ ${place.rating.toFixed(1)}` : "No rating";
    const openNow = place.opening_hours?.isOpen() ?? place.opening_hours?.open_now;
    const openText = (openNow === true) ? "Open now" : (openNow === false) ? "Closed now" : "Hours unknown";
    const gmapsLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.name)}&destination_place_id=${place.place_id}`;
    infoWindow.setContent(`
      <div style="max-width:240px">
        <strong>${place.name}</strong><br/>
        <div>${addr}</div>
        <div style="margin:6px 0">${rating} · ${openText}</div>
        <a target="_blank" href="${gmapsLink}">Directions →</a>
      </div>
    `);
    infoWindow.open(map, marker);
  });
  markers.push(marker);
}

function listResults(places) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  places.forEach((p, idx) => {
    const el = document.createElement("div");
    el.className = "place";
    const addr = p.vicinity || p.formatted_address || "";
    const rating = p.rating ? `⭐ ${p.rating.toFixed(1)}` : "No rating";
    el.innerHTML = `<h4>${idx + 1}. ${p.name}</h4>
                    <div class="muted">${addr}</div>
                    <div class="muted">${rating}${p.price_level != null ? " · $" .repeat(p.price_level + 1) : ""}</div>`;
    el.addEventListener("click", () => {
      map.panTo(p.geometry.location);
      map.setZoom(17);
    });
    container.appendChild(el);
  });
}

function applyClientFilters(places) {
  const minRating = parseFloat(document.getElementById("minRating").value);
  const maxPrice = parseInt(document.getElementById("maxPrice").value, 10);
  return places.filter(p => {
    const okRating = !p.rating || p.rating >= minRating;
    const okPrice = (p.price_level == null) || p.price_level <= maxPrice;
    return okRating && okPrice;
  });
}

function paginate(direction) {
  // PlacesService pagination is forward-only; here we just call nextPage when available
  if (direction === 1 && pagination && pagination.hasNextPage) {
    pagination.nextPage();
  }
}

function runNearbySearch() {
  clearMarkers();
  setStatus("Searching cafes…");

  const center = map.getCenter();
  const radius = parseInt(document.getElementById("radius").value, 10);
  const openNow = document.getElementById("openNow").checked;
  const keyword = document.getElementById("keyword").value.trim() || undefined;

  const request = {
    location: center,
    radius,
    type: "cafe",
    openNow,
    keyword
  };

  placesService.nearbySearch(request, (results, status, pag) => {
    if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
      setStatus("No results. Try increasing radius or clearing filters.");
      document.getElementById("nextPage").disabled = true;
      document.getElementById("prevPage").disabled = true;
      return;
    }

    // Save pagination handle (forward only)
    pagination = pag || null;
    document.getElementById("nextPage").disabled = !(pagination && pagination.hasNextPage);
    document.getElementById("prevPage").disabled = true; // not supported by client-side SDK

    const filtered = applyClientFilters(results);
    filtered.forEach(addMarker);
    listResults(filtered);

    // Fit to markers if any
    if (filtered.length) {
      const bounds = new google.maps.LatLngBounds();
      filtered.forEach(p => bounds.extend(p.geometry.location));
      map.fitBounds(bounds, 80);
      setStatus(`Found ${filtered.length} cafe(s) in ${radius/1000} km.`);
    } else {
      setStatus("No matches after filters. Adjust filters or radius.");
    }
  });
}

// Make initMap available globally for Google Maps callback
window.initMap = initMap;