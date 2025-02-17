mapboxgl.accessToken = 'pk.eyJ1Ijoia2F0ZWx5bnpoYW8iLCJhIjoiY203ODVmMWZmMWVldzJyb21pazdkOTQ2YyJ9.2Ze5GjwD6g1z_lcXzqbkuQ';

const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/streets-v12', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

map.on('load', () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });
    map.addLayer({
        id: 'botston-bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
          'line-color': 'green',
          'line-width': 3,
          'line-opacity': 0.6
        }
    });
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });
    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
          'line-color': 'green',
          'line-width': 3,
          'line-opacity': 0.6
        }
    });
});

const svg = d3.select('#map').select('svg');
let stations = [];
let timeFilter = -1;
let filteredTrips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];

map.on('load', () => {
    const jsonurl = 'bluebikes-stations.json'
    d3.json(jsonurl).then(jsonData => {
        console.log('Loaded JSON Data:', jsonData);
        stations = jsonData.data.stations;
        console.log('Stations Array:', stations);
        const csvurl = 'bluebikes-traffic.csv'
        d3.csv(csvurl).then(trips => {
            for (let trip of trips) {
                trip.started_at = new Date(trip.start_time);
                trip.ended_at = new Date(trip.end_time);
            }
            console.log('Loaded CSV Data:', trips);
            // arrivals = d3.rollup(
            //     trips,
            //     (v) => v.length,
            //     (d) => d.end_station_id,
            // );
            // departures = d3.rollup(
            //     trips,
            //     (v) => v.length,
            //     (d) => d.start_station_id,
            // );
            // stations = stations.map((station) => {
            //     let id = station.short_name;
            //     station.arrivals = arrivals.get(id) ?? 0;
            //     station.departures = departures.get(id) ?? 0;
            //     station.totalTraffic = station.arrivals + station.departures;
            //     return station;
            // });
            const timeSlider = document.getElementById('time-slider');
            const selectedTime = document.getElementById('selected-time');
            const anyTimeLabel = document.getElementById('any-time');

            function formatTime(minutes) {
                const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
                return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
            }
            
            function updateTimeDisplay() {
                timeFilter = Number(timeSlider.value);  // Get slider value
            
                if (timeFilter === -1) {
                    selectedTime.textContent = '';  // Clear time display
                    anyTimeLabel.style.display = 'block';  // Show "(any time)"
                } else {
                    selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
                    anyTimeLabel.style.display = 'none';  // Hide "(any time)"
                }
            
                filterTripsbyTime();
            }
            
            timeSlider.addEventListener('input', updateTimeDisplay);
            updateTimeDisplay();
            
            function minutesSinceMidnight(date) {
                return date.getHours() * 60 + date.getMinutes();
            }
            
            function filterTripsbyTime() {
                filteredTrips = timeFilter === -1
                    ? trips
                    : trips.filter((trip) => {
                        const startedMinutes = minutesSinceMidnight(trip.started_at);
                        const endedMinutes = minutesSinceMidnight(trip.ended_at);
                        return (
                        Math.abs(startedMinutes - timeFilter) <= 60 ||
                        Math.abs(endedMinutes - timeFilter) <= 60
                        );
                    });
                    filteredArrivals = d3.rollup(
                        filteredTrips,
                        (v) => v.length,
                        (d) => d.end_station_id,
                    );
                    filteredDepartures = d3.rollup(
                        filteredTrips,
                        (v) => v.length,
                        (d) => d.start_station_id,
                    );
                    filteredStations = stations.map((station) => {
                        station = { ...station };
                        let id = station.short_name;
                        station.arrivals = filteredArrivals.get(id) ?? 0;
                        station.departures = filteredDepartures.get(id) ?? 0;
                        station.totalTraffic = station.arrivals + station.departures;
                        return station;
                    });
            }
            
            const radiusScale = d3
                .scaleSqrt()
                .domain([0, d3.max(stations, (d) => d.totalTraffic)])
                .range(timeFilter === -1 ? [0, 25] : [3, 50]);

            function getCoords(station) {
                const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
                const { x, y } = map.project(point);  // Project to pixel coordinates
                return { cx: x, cy: y };  // Return as object for use in SVG attributes
            }
            
            function updatePositions() {
                circles
                    .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
                    .attr('cy', d => getCoords(d).cy)  // Set the y-position using projected coordinates
                    .attr('r', d => radiusScale(d)); // Set the radius using the scale
            }
            
            const circles = svg.selectAll('circle')
                .data(filteredStations)
                .enter()
                .append('circle')
                .attr('r', 5)               // Radius of the circle
                .attr('fill', 'steelblue')  // Circle fill color
                .attr('stroke', 'white')    // Circle border color
                .attr('stroke-width', 1)    // Circle border thickness
                .attr('opacity', 0.8)      // Circle opacity
                .each(function(d) {
                    d3.select(this)
                      .append('title')
                      .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
                });
    
            updatePositions();
    
            map.on('move', updatePositions);     // Update during map movement
            map.on('zoom', updatePositions);     // Update during zooming
            map.on('resize', updatePositions);   // Update on window resize
            map.on('moveend', updatePositions);  // Final adjustment after movement ends

        }).catch(error => {
            console.error('Error loading CSV:', error);
        });
    }).catch(error => {
        console.error('Error loading JSON:', error); 
    });
});


