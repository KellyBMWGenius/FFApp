// Configuration
const CONFIG = {
    sleeper: {
        username: 'coyoteoty',
        leagueId: '1257448634119626752'
    },
    fantasyCalc: {
        url: 'https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=2&numTeams=10&ppr=1'
    },
    positions: {
        starters: [
            { name: 'QB', positions: ['QB'], count: 1 },
            { name: 'RB', positions: ['RB'], count: 2 },
            { name: 'WR', positions: ['WR'], count: 3 },
            { name: 'TE', positions: ['TE'], count: 1 },
            { name: 'SFLEX', positions: ['QB', 'RB', 'WR', 'TE'], count: 1 },
            { name: 'FLEX', positions: ['RB', 'WR', 'TE'], count: 2 }
        ],
        excluded: ['K', 'DEF']
    }
};

// Global state
let allData = {
    league: null,
    rosters: [],
    users: [],
    players: {},
    playerValues: {},
    projectionData: {},
    processedRosters: []
};

let appState = {
    selectedTeams: new Set(['all']), // Start with all teams selected
    currentFilter: 'all',
    viewMode: 'optimal', // 'optimal' or 'positional'
    teamSort: 'value', // 'value', 'starter-value', 'name'
    searchQuery: '',
    projectionMode: 'average', // 'week', 'average', or 'season'
    theme: 'dark' // 'dark' or 'light'
};

// Initialize theme
function initializeTheme() {
    // Check for saved theme preference or default to dark
    const savedTheme = localStorage.getItem('ffapp-theme') || 'dark';
    appState.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

// Toggle theme
function toggleTheme() {
    const newTheme = appState.theme === 'dark' ? 'light' : 'dark';
    appState.theme = newTheme;
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('ffapp-theme', newTheme);
    updateThemeIcon(newTheme);
}

// Update theme icon
function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('themeToggle');
    const icon = themeToggle.querySelector('i');
    
    if (theme === 'dark') {
        icon.className = 'fas fa-moon';
        themeToggle.title = 'Switch to light mode';
    } else {
        icon.className = 'fas fa-sun';
        themeToggle.title = 'Switch to dark mode';
    }
}

// Debug tracking for missing projections
let missingProjections = new Set();
let missingEspnIds = new Set();

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatValue = (value) => {
    if (!value || value === 0) return '0';
    return value.toLocaleString();
};

const getValueClass = (value, position = null) => {
    if (!value || value === 0) return 'low';
    
    // Position-specific thresholds
    if (position) {
        switch (position) {
            case 'QB':
                if (value >= 8000) return 'very-high';
                if (value >= 4000) return 'high';
                if (value >= 1500) return 'medium';
                return 'low';
            case 'RB':
                if (value >= 6000) return 'very-high';
                if (value >= 3000) return 'high';
                if (value >= 1000) return 'medium';
                return 'low';
            case 'WR':
                if (value >= 5000) return 'very-high';
                if (value >= 2500) return 'high';
                if (value >= 800) return 'medium';
                return 'low';
            case 'TE':
                if (value >= 4000) return 'very-high';
                if (value >= 2000) return 'high';
                if (value >= 600) return 'medium';
                return 'low';
        }
    }
    
    // Fallback to original thresholds
    if (value >= 4000) return 'very-high';
    if (value >= 2000) return 'high';
    if (value >= 800) return 'medium';
    return 'low';
};

const getProjectionClass = (projection, position = null) => {
    if (!projection || projection === 0) return 'low';
    
    // Position-specific thresholds
    if (position) {
        switch (position) {
            case 'QB':
                if (projection >= 25) return 'very-high';
                if (projection >= 20) return 'high';
                if (projection >= 15) return 'medium';
                return 'low';
            case 'RB':
                if (projection >= 20) return 'very-high';
                if (projection >= 15) return 'high';
                if (projection >= 10) return 'medium';
                return 'low';
            case 'WR':
                if (projection >= 18) return 'very-high';
                if (projection >= 14) return 'high';
                if (projection >= 9) return 'medium';
                return 'low';
            case 'TE':
                if (projection >= 15) return 'very-high';
                if (projection >= 12) return 'high';
                if (projection >= 8) return 'medium';
                return 'low';
        }
    }
    
    // Fallback to original thresholds
    if (projection >= 22) return 'very-high';
    if (projection >= 16) return 'high';
    if (projection >= 10) return 'medium';
    return 'low';
};

// ESPN ID mapping for projections
const findProjectionByEspnId = (sleeperId, espnIdMap, projectionData) => {
    const espnId = espnIdMap[sleeperId];
    return espnId ? projectionData[espnId] : null;
};

// API Functions
async function fetchSleeperData() {
    try {
        // Fetch league info
        const leagueResponse = await fetch(`https://api.sleeper.app/v1/league/${CONFIG.sleeper.leagueId}`);
        const league = await leagueResponse.json();
        
        // Fetch rosters
        const rostersResponse = await fetch(`https://api.sleeper.app/v1/league/${CONFIG.sleeper.leagueId}/rosters`);
        const rosters = await rostersResponse.json();
        
        // Fetch users
        const usersResponse = await fetch(`https://api.sleeper.app/v1/league/${CONFIG.sleeper.leagueId}/users`);
        const users = await usersResponse.json();
        
        // Fetch all players
        const playersResponse = await fetch('https://api.sleeper.app/v1/players/nfl');
        const players = await playersResponse.json();
        
        return { league, rosters, users, players };
    } catch (error) {
        console.error('Error fetching Sleeper data:', error);
        throw new Error('Failed to fetch league data from Sleeper');
    }
}

async function fetchFantasyCalcValues() {
    try {
        const response = await fetch(CONFIG.fantasyCalc.url);
        const data = await response.json();
        
        // Create maps for both sleeper ID and ESPN ID lookups
        const valueMap = {};
        const espnIdMap = {};
        
        data.forEach(player => {
            if (player.player.sleeperId) {
                valueMap[player.player.sleeperId] = player.value;
                
                // Also store ESPN ID mapping if available
                if (player.player.espnId) {
                    espnIdMap[player.player.sleeperId] = player.player.espnId;
                }
            }
        });
        
        return { valueMap, espnIdMap };
    } catch (error) {
        console.error('Error fetching FantasyCalc values:', error);
        throw new Error('Failed to fetch player values from FantasyCalc');
    }
}

async function fetchProjectionData() {
    try {
        const response = await fetch('espndata/player_data.json');
        const data = await response.json();
        
        // Convert to a map by ESPN ID for perfect lookup
        const projectionMap = {};
        data.forEach(player => {
            projectionMap[player.playerId] = {
                weekProjection: player.week_1_projection?.projected_points || 0,
                seasonProjection: player.season_projection?.projected_avg_points || 0
            };
        });
        
        return projectionMap;
    } catch (error) {
        console.error('Error fetching projection data:', error);
        console.warn('Projection data not available, continuing without it');
        return {};
    }
}

// Data processing functions
function processRosterData() {
    const processedRosters = [];
    
    allData.rosters.forEach(roster => {
        // Find the user for this roster
        const user = allData.users.find(u => u.user_id === roster.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || 'Unknown Team';
        
        // Get all players for this roster
        const allPlayers = [...(roster.players || []), ...(roster.starters || [])];
        const uniquePlayers = [...new Set(allPlayers)];
        
        const rosterPlayers = uniquePlayers
            .map(playerId => {
                const player = allData.players[playerId];
                if (!player) return null;
                
                // Skip excluded positions
                if (CONFIG.positions.excluded.includes(player.position)) {
                    return null;
                }
                
                const value = allData.playerValues[playerId] || 0;
                
                return {
                    id: playerId,
                    name: `${player.first_name} ${player.last_name}`,
                    position: player.position,
                    team: player.team || 'FA',
                    value: value,
                    isStarter: roster.starters?.includes(playerId) || false
                };
            })
            .filter(player => player !== null)
            .sort((a, b) => b.value - a.value);
        
        // Organize into positions
        const organizedRoster = organizePlayersByPosition(rosterPlayers);
        
        // Calculate total values
        const totalValue = rosterPlayers.reduce((sum, player) => sum + player.value, 0);
        const starterValue = rosterPlayers
            .filter(p => p.isStarter)
            .reduce((sum, player) => sum + player.value, 0);
        
        processedRosters.push({
            rosterId: roster.roster_id,
            teamName,
            user,
            players: rosterPlayers,
            organized: organizedRoster,
            stats: {
                totalValue,
                starterValue,
                playerCount: rosterPlayers.length,
                starterCount: rosterPlayers.filter(p => p.isStarter).length
            }
        });
    });
    
    return processedRosters.sort((a, b) => b.stats.totalValue - a.stats.totalValue);
}

function organizePlayersByPosition(players) {
    const organized = {
        starters: {},
        bench: []
    };
    
    // Initialize starter positions
    CONFIG.positions.starters.forEach(pos => {
        organized.starters[pos.name] = [];
    });
    
    // Create a copy of players to work with
    const availablePlayers = [...players];
    
    // Fill starter positions optimally
    CONFIG.positions.starters.forEach(positionDef => {
        const { name, positions, count } = positionDef;
        
        for (let i = 0; i < count; i++) {
            // Find the highest value player who can fill this position
            let bestPlayerIndex = -1;
            let bestValue = -1;
            
            availablePlayers.forEach((player, index) => {
                if (positions.includes(player.position) && player.value > bestValue) {
                    bestValue = player.value;
                    bestPlayerIndex = index;
                }
            });
            
            if (bestPlayerIndex >= 0) {
                const player = availablePlayers.splice(bestPlayerIndex, 1)[0];
                organized.starters[name].push(player);
            }
        }
    });
    
    // Remaining players go to bench
    organized.bench = availablePlayers.sort((a, b) => b.value - a.value);
    
    return organized;
}

function organizePlayersByActualPosition(players) {
    const organized = {
        QB: [],
        RB: [],
        WR: [],
        TE: []
    };
    
    // Group players by their actual position and sort by value within each position
    players.forEach(player => {
        if (organized[player.position]) {
            organized[player.position].push(player);
        }
    });
    
    // Sort each position group by value (highest first)
    Object.keys(organized).forEach(position => {
        organized[position].sort((a, b) => b.value - a.value);
    });
    
    return organized;
}

// UI Functions
function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'flex';
    document.getElementById('rostersContainer').style.display = 'none';
    document.getElementById('errorMessage').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loadingSpinner').style.display = 'none';
}

function showError(message) {
    hideLoading();
    document.getElementById('errorText').textContent = message;
    document.getElementById('errorMessage').style.display = 'flex';
    document.getElementById('rostersContainer').style.display = 'none';
}

function showRosters() {
    hideLoading();
    document.getElementById('errorMessage').style.display = 'none';
    document.getElementById('rostersContainer').style.display = 'block';
}

function updateLeagueInfo() {
    const leagueName = allData.league?.name || 'Unknown League';
    document.getElementById('leagueName').textContent = leagueName;
}

function populateTeamSelector() {
    const optionsContainer = document.getElementById('teamSelectOptions');
    
    // Clear existing options (except "All Teams")
    const existingOptions = optionsContainer.querySelectorAll('.select-option:not([data-value="all"])');
    existingOptions.forEach(option => option.remove());
    
    // Add each team as an option
    allData.processedRosters.forEach(roster => {
        const option = document.createElement('div');
        option.className = 'select-option';
        option.setAttribute('data-value', roster.rosterId);
        
        option.innerHTML = `
            <input type="checkbox" id="team-${roster.rosterId}" checked>
            <label for="team-${roster.rosterId}">${roster.teamName}</label>
        `;
        
        optionsContainer.appendChild(option);
    });
    
    updateTeamSelectorLabel();
}

function updateTeamSelectorLabel() {
    const label = document.getElementById('teamSelectLabel');
    
    if (appState.selectedTeams.has('all') || appState.selectedTeams.size === allData.processedRosters.length) {
        label.textContent = 'All Teams';
    } else if (appState.selectedTeams.size === 0) {
        label.textContent = 'No Teams Selected';
    } else if (appState.selectedTeams.size === 1) {
        const selectedRosterId = Array.from(appState.selectedTeams)[0];
        const team = allData.processedRosters.find(r => r.rosterId.toString() === selectedRosterId);
        label.textContent = team ? team.teamName : '1 Team Selected';
    } else {
        label.textContent = `${appState.selectedTeams.size} Teams Selected`;
    }
}

function handleTeamSelection(rosterId, isChecked) {
    if (rosterId === 'all') {
        if (isChecked) {
            // Select all teams
            appState.selectedTeams.clear();
            appState.selectedTeams.add('all');
            
            // Check all checkboxes
            document.querySelectorAll('.select-option input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = true;
            });
        } else {
            // Unselect all teams
            appState.selectedTeams.clear();
            
            // Uncheck all checkboxes
            document.querySelectorAll('.select-option input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
            });
        }
    } else {
        // Handle individual team selection
        if (isChecked) {
            appState.selectedTeams.delete('all');
            appState.selectedTeams.add(rosterId);
            
            // If all individual teams are selected, select "All" as well
            if (appState.selectedTeams.size === allData.processedRosters.length) {
                appState.selectedTeams.add('all');
                document.getElementById('selectAll').checked = true;
            }
        } else {
            appState.selectedTeams.delete(rosterId);
            appState.selectedTeams.delete('all');
            document.getElementById('selectAll').checked = false;
        }
    }
    
    updateTeamSelectorLabel();
    applyFiltersAndRender();
}

function applyFiltersAndRender() {
    let filteredRosters = [...allData.processedRosters];
    
    // Apply team filter
    if (!appState.selectedTeams.has('all') && appState.selectedTeams.size > 0) {
        filteredRosters = filteredRosters.filter(roster => 
            appState.selectedTeams.has(roster.rosterId.toString())
        );
    }
    
    // Apply position filter and organize by view mode
    filteredRosters = filteredRosters.map(roster => {
        let filteredPlayers;
        if (appState.currentFilter === 'starters') {
            filteredPlayers = roster.players.filter(p => p.isStarter);
        } else if (appState.currentFilter === 'bench') {
            filteredPlayers = roster.players.filter(p => !p.isStarter);
        } else {
            filteredPlayers = roster.players;
        }
        
        // Organize based on view mode
        let organized;
        if (appState.viewMode === 'positional') {
            organized = organizePlayersByActualPosition(filteredPlayers);
        } else {
            organized = organizePlayersByPosition(filteredPlayers);
        }
        
        return {
            ...roster,
            players: filteredPlayers,
            organized: organized
        };
    });
    

    
    // Apply team sorting
    filteredRosters.sort((a, b) => {
        switch (appState.teamSort) {
            case 'value':
                return b.stats.totalValue - a.stats.totalValue;
            case 'starter-value':
                return b.stats.starterValue - a.stats.starterValue;
            case 'name':
                return a.teamName.localeCompare(b.teamName);
            default:
                return b.stats.totalValue - a.stats.totalValue;
        }
    });
    
    renderRosters(filteredRosters);
}

function renderRosters(rosters) {
    const container = document.getElementById('rostersGrid');
    container.innerHTML = '';
    
    if (rosters.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #666;">
                <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>No teams match your current filters</p>
            </div>
        `;
        return;
    }
    
    // For positional view, we need to ensure all teams have the same structure
    if (appState.viewMode === 'positional') {
        const maxPlayersPerPosition = getMaxPlayersPerPosition(rosters);
        rosters.forEach((roster, index) => {
            const card = createRosterCard(roster, maxPlayersPerPosition);
            card.style.animationDelay = `${index * 0.1}s`;
            container.appendChild(card);
        });
    } else {
        rosters.forEach((roster, index) => {
            const card = createRosterCard(roster);
            card.style.animationDelay = `${index * 0.1}s`;
            container.appendChild(card);
        });
    }
}

function getMaxPlayersPerPosition(rosters) {
    const maxCounts = { QB: 0, RB: 0, WR: 0, TE: 0 };
    
    rosters.forEach(roster => {
        Object.keys(maxCounts).forEach(position => {
            const count = (roster.organized[position] || []).length;
            maxCounts[position] = Math.max(maxCounts[position], count);
        });
    });
    
    return maxCounts;
}

function createRosterCard(roster, maxPlayersPerPosition = null) {
    const card = document.createElement('div');
    card.className = 'roster-card';
    card.setAttribute('data-view-mode', appState.viewMode);
    
    card.innerHTML = `
        <div class="roster-header">
            <h3>${roster.teamName}</h3>
            <div class="roster-stats">
                <div class="stat">
                    <div class="stat-value">${formatValue(roster.stats.totalValue)}</div>
                    <div>Total Value</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${formatValue(roster.stats.starterValue)}</div>
                    <div>Starter Value</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${roster.stats.playerCount}</div>
                    <div>Players</div>
                </div>
            </div>
        </div>
        <div class="roster-body">
            ${createPositionSections(roster.organized, maxPlayersPerPosition)}
        </div>
    `;
    
    return card;
}

function createPositionSections(organized, maxPlayersPerPosition = null) {
    let html = '';
    
    if (appState.viewMode === 'positional') {
        // Positional comparison view
        const positions = ['QB', 'RB', 'WR', 'TE'];
        
        positions.forEach(position => {
            const players = organized[position] || [];
            const maxPlayers = maxPlayersPerPosition ? maxPlayersPerPosition[position] : players.length;
            
            if (maxPlayers > 0) {
                html += '<div class="position-section">';
                html += `<div class="position-header">${position} <span class="position-count">${players.length}</span></div>`;
                
                // Add column headers
                html += '<div class="column-headers">';
                html += '<div class="header-player">Player</div>';
                html += '<div class="header-position">Position</div>';
                html += '<div class="header-projection">Projection</div>';
                html += '<div class="header-value">Value</div>';
                html += '</div>';
                
                // Add actual players
                players.forEach(player => {
                    html += createPlayerRow(player);
                });
                
                // Add empty rows to align with teams that have more players in this position
                for (let i = players.length; i < maxPlayers; i++) {
                    html += `
                        <div class="player-row empty">
                            <div class="player-info">
                                <div class="player-name">-</div>
                                <div class="player-details">-</div>
                            </div>
                            <div class="position-badge">${position}</div>
                            <div class="player-projection low">-</div>
                            <div class="player-value low">-</div>
                        </div>
                    `;
                }
                
                html += '</div>';
            }
        });
    } else {
        // Optimal lineup view (default)
        html += '<div class="position-section">';
        html += '<div class="position-header">STARTERS <span class="position-count">10</span></div>';
        
        // Add column headers
        html += '<div class="column-headers">';
        html += '<div class="header-player">Player</div>';
        html += '<div class="header-position">Position</div>';
        html += '<div class="header-projection">Projection</div>';
        html += '<div class="header-value">Value</div>';
        html += '</div>';
        
        CONFIG.positions.starters.forEach(positionDef => {
            const players = organized.starters[positionDef.name] || [];
            
            html += `<div class="position-group">`;
            html += `<div class="position-subheader">${positionDef.name}</div>`;
            
            for (let i = 0; i < positionDef.count; i++) {
                const player = players[i];
                if (player) {
                    html += createPlayerRow(player);
                } else {
                    html += `<div class="player-row empty">
                        <div class="player-info">
                            <div class="player-name">Empty Slot</div>
                        </div>
                        <div class="position-badge">${positionDef.name}</div>
                        <div class="player-projection low">0.0</div>
                        <div class="player-value">0</div>
                    </div>`;
                }
            }
            html += '</div>';
        });
        
        html += '</div>';
        
        // Bench
        if (organized.bench && organized.bench.length > 0) {
            html += '<div class="position-section">';
            html += `<div class="position-header">BENCH <span class="position-count">${organized.bench.length}</span></div>`;
            
            // Add column headers
            html += '<div class="column-headers">';
            html += '<div class="header-player">Player</div>';
            html += '<div class="header-position">Position</div>';
            html += '<div class="header-projection">Projection</div>';
            html += '<div class="header-value">Value</div>';
            html += '</div>';
            
            organized.bench.forEach(player => {
                html += createPlayerRow(player);
            });
            
            html += '</div>';
        }
    }
    
    return html;
}

function createPlayerRow(player) {
    // Get projection data for this player using ESPN ID mapping
    const espnId = allData.espnIdMap[player.id];
    const projection = espnId ? allData.projectionData[espnId] : null;
    let projectionValue = 0;
    let projectionText = 'N/A';
    
    if (projection) {
        if (appState.projectionMode === 'week') {
            projectionValue = projection.weekProjection;
            projectionText = projectionValue.toFixed(1);
        } else if (appState.projectionMode === 'average') {
            projectionValue = projection.seasonProjection;
            projectionText = projectionValue.toFixed(1);
        } else {
            projectionValue = projection.seasonProjection * 17;
            projectionText = projectionValue.toFixed(1);
        }
    } else {
        // Track missing ESPN IDs for debugging
        if (!espnId) {
            missingEspnIds.add(player.id);
        } else {
            missingProjections.add(player.id);
        }
    }
    
    return `
        <div class="player-row">
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-details">${player.team}</div>
            </div>
            <div class="position-badge">${player.position}</div>
            <div class="player-projection ${getProjectionClass(projectionValue, player.position)}">${projectionText}</div>
            <div class="player-value ${getValueClass(player.value, player.position)}">${formatValue(player.value)}</div>
        </div>
    `;
}

// Event handlers
function setupEventListeners() {
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', loadAllData);
    
    // Team selector
    document.getElementById('teamSelectTrigger').addEventListener('click', toggleTeamSelector);
    document.addEventListener('click', closeTeamSelectorOnOutsideClick);
    

    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', handleFilter);
    });
    
    // View mode dropdown
    document.getElementById('sortBy').addEventListener('change', handleViewModeChange);
    
    // Team sort dropdown
    document.getElementById('teamSortBy').addEventListener('change', handleTeamSortChange);
    
    // Projection mode dropdown
    document.getElementById('projectionMode').addEventListener('change', handleProjectionModeChange);

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
}

function toggleTeamSelector() {
    const customSelect = document.querySelector('.custom-select');
    customSelect.classList.toggle('active');
}

function closeTeamSelectorOnOutsideClick(event) {
    const customSelect = document.querySelector('.custom-select');
    if (!customSelect.contains(event.target)) {
        customSelect.classList.remove('active');
    }
}

function setupTeamSelectorListeners() {
    // Add event listeners for team checkboxes
    document.getElementById('teamSelectOptions').addEventListener('change', (event) => {
        if (event.target.type === 'checkbox') {
            const rosterId = event.target.closest('.select-option').getAttribute('data-value');
            handleTeamSelection(rosterId, event.target.checked);
        }
    });
}



function handleFilter(event) {
    // Update active filter button
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    appState.currentFilter = event.target.getAttribute('data-filter');
    applyFiltersAndRender();
}

function handleViewModeChange(event) {
    appState.viewMode = event.target.value;
    applyFiltersAndRender();
}

function handleTeamSortChange(event) {
    appState.teamSort = event.target.value;
    applyFiltersAndRender();
}

function handleProjectionModeChange(event) {
    appState.projectionMode = event.target.value;
    applyFiltersAndRender();
}

// Main initialization
async function loadAllData() {
    showLoading();
    
    // Clear debug data
    missingProjections.clear();
    missingEspnIds.clear();
    
    try {
        // Fetch all data
        console.log('Fetching Sleeper data...');
        const sleeperData = await fetchSleeperData();
        
        console.log('Fetching FantasyCalc values...');
        const { valueMap, espnIdMap } = await fetchFantasyCalcValues();
        
        console.log('Fetching projection data...');
        const projectionData = await fetchProjectionData();
        
        // Store in global state
        allData = {
            ...allData,
            ...sleeperData,
            playerValues: valueMap,
            espnIdMap,
            projectionData
        };
        
        console.log('Processing roster data...');
        allData.processedRosters = processRosterData();
        
        // Update UI
        updateLeagueInfo();
        populateTeamSelector();
        setupTeamSelectorListeners();
        applyFiltersAndRender();
        showRosters();
        
        console.log('Data loaded successfully');
        
        // Log debug info
        if (missingProjections.size > 0) {
            console.log('Players with ESPN IDs but missing projections:', Array.from(missingProjections));
        }
        if (missingEspnIds.size > 0) {
            console.log('Players missing ESPN IDs from FantasyCalc:', Array.from(missingEspnIds));
        }
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError(error.message);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme(); // Initialize theme on load
    setupEventListeners();
    loadAllData();
});

// Export for debugging
window.debug = {
    allData,
    CONFIG,
    loadAllData,
    processRosterData,
    missingProjections,
    missingEspnIds,
    findProjectionByEspnId
};
