// Configuration
let CONFIG = {
    sleeper: {
        username: null,
        leagueId: null,
        userId: null
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

// User authentication state
let userAuth = {
    isAuthenticated: false,
    username: null,
    userId: null,
    leagueId: null,
    userLeagues: []
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
    selectedTeams: new Set(['all']),
    rosterView: 'optimal',
    teamSort: 'value',
    searchQuery: '',
    projectionMode: 'average',
    valueNormalization: 'raw',
    theme: 'dark',
    horizontalView: false
};

// NEW: State for the trade calculator
let tradeState = {
    teams: [], // Will store { rosterId, columnEl, listElId, selectElId }
    tradeParts: {}, // e.g., { 'rosterId1': { sending: Map(), receiving: Map() } }
    viewMode: 'optimal' // Add view mode state for trade calculator
};

// Debug tracking
let missingProjections = new Set();
let missingEspnIds = new Set();

// ==================================================================
// == SECTION 1: ORIGINAL APPLICATION LOGIC (INITIALIZATION & UTILS)
// ==================================================================

function initializeTheme() {
    const savedTheme = localStorage.getItem('ffapp-theme') || 'dark';
    appState.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function initializeHorizontalView() {
    const savedHorizontalView = localStorage.getItem('ffapp-horizontal-view') === 'true';
    appState.horizontalView = savedHorizontalView;
    
    if (savedHorizontalView) {
        const rostersContainer = document.getElementById('rostersContainer');
        const horizontalViewBtn = document.getElementById('horizontalViewBtn');
        
        if (rostersContainer && horizontalViewBtn) {
            rostersContainer.classList.add('horizontal-view');
            horizontalViewBtn.classList.add('active');
            horizontalViewBtn.innerHTML = '<i class="fas fa-th"></i>';
            horizontalViewBtn.title = 'Switch to vertical grid view';
            
            if (allData.processedRosters && allData.processedRosters.length > 0) {
                const teamCount = allData.processedRosters.length;
                rostersContainer.setAttribute('data-team-count', `${teamCount} Teams - Use arrow keys or scroll to navigate`);
            }
        }
    }
}

function toggleTheme() {
    const newTheme = appState.theme === 'dark' ? 'light' : 'dark';
    appState.theme = newTheme;
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('ffapp-theme', newTheme);
    updateThemeIcon(newTheme);
}

function toggleHorizontalView() {
    appState.horizontalView = !appState.horizontalView;
    const rostersContainer = document.getElementById('rostersContainer');
    const horizontalViewBtn = document.getElementById('horizontalViewBtn');
    
    if (appState.horizontalView) {
        rostersContainer.classList.add('horizontal-view');
        horizontalViewBtn.classList.add('active');
        horizontalViewBtn.innerHTML = '<i class="fas fa-th"></i>';
        horizontalViewBtn.title = 'Switch to vertical grid view';
        const teamCount = allData.processedRosters.length;
        rostersContainer.setAttribute('data-team-count', `${teamCount} Teams - Use arrow keys or scroll to navigate`);
    } else {
        rostersContainer.classList.remove('horizontal-view');
        horizontalViewBtn.classList.remove('active');
        horizontalViewBtn.innerHTML = '<i class="fas fa-arrows-alt-h"></i>';
        horizontalViewBtn.title = 'Toggle horizontal view for side-by-side roster comparison';
        rostersContainer.removeAttribute('data-team-count');
    }
    localStorage.setItem('ffapp-horizontal-view', appState.horizontalView);
}

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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeValue = (value, maxValue) => {
    if (!value || value === 0 || !maxValue || maxValue === 0) return 0;
    return Math.round((value / maxValue) * 100);
};

const getMaxPlayerValue = (playerValues) => {
    if (!playerValues || Object.keys(playerValues).length === 0) return 1;
    return Math.max(...Object.values(playerValues));
};

const formatValue = (value, isNormalized = false) => {
    if (!value && value !== 0) return '0';
    if (isNormalized) return Math.round(value).toString();
    return value.toLocaleString();
};

const getValueClass = (value, position = null, isNormalized = false) => {
    if (!value || value === 0) return 'low';
    if (isNormalized) {
        if (value >= 85) return 'very-high';
        if (value >= 65) return 'high';
        if (value >= 35) return 'medium';
        return 'low';
    }
    if (position) {
        switch (position) {
            case 'QB': if (value >= 8000) return 'very-high'; if (value >= 4000) return 'high'; if (value >= 1500) return 'medium'; return 'low';
            case 'RB': if (value >= 6000) return 'very-high'; if (value >= 3000) return 'high'; if (value >= 1000) return 'medium'; return 'low';
            case 'WR': if (value >= 5000) return 'very-high'; if (value >= 2500) return 'high'; if (value >= 800) return 'medium'; return 'low';
            case 'TE': if (value >= 4000) return 'very-high'; if (value >= 2000) return 'high'; if (value >= 600) return 'medium'; return 'low';
        }
    }
    if (value >= 4000) return 'very-high'; if (value >= 2000) return 'high'; if (value >= 800) return 'medium'; return 'low';
};

const getProjectionClass = (projection, position = null, projectionMode = 'average') => {
    if (!projection || projection === 0) return 'low';
    if (projectionMode === 'season') {
        if (position) {
            switch (position) {
                case 'QB': if (projection >= 425) return 'very-high'; if (projection >= 340) return 'high'; if (projection >= 255) return 'medium'; return 'low';
                case 'RB': if (projection >= 340) return 'very-high'; if (projection >= 255) return 'high'; if (projection >= 170) return 'medium'; return 'low';
                case 'WR': if (projection >= 306) return 'very-high'; if (projection >= 238) return 'high'; if (projection >= 153) return 'medium'; return 'low';
                case 'TE': if (projection >= 255) return 'very-high'; if (projection >= 204) return 'high'; if (projection >= 136) return 'medium'; return 'low';
            }
        }
        if (projection >= 374) return 'very-high'; if (projection >= 272) return 'high'; if (projection >= 170) return 'medium'; return 'low';
    }
    if (position) {
        switch (position) {
            case 'QB': if (projection >= 25) return 'very-high'; if (projection >= 20) return 'high'; if (projection >= 15) return 'medium'; return 'low';
            case 'RB': if (projection >= 20) return 'very-high'; if (projection >= 15) return 'high'; if (projection >= 10) return 'medium'; return 'low';
            case 'WR': if (projection >= 18) return 'very-high'; if (projection >= 14) return 'high'; if (projection >= 9) return 'medium'; return 'low';
            case 'TE': if (projection >= 15) return 'very-high'; if (projection >= 12) return 'high'; if (projection >= 8) return 'medium'; return 'low';
        }
    }
    if (projection >= 22) return 'very-high'; if (projection >= 16) return 'high'; if (projection >= 10) return 'medium'; return 'low';
};

const findProjectionByEspnId = (sleeperId, espnIdMap, projectionData) => {
    const espnId = espnIdMap[sleeperId];
    return espnId ? projectionData[espnId] : null;
};

// NEW: Helper function to get projected points for a player
const getPlayerProjectedPoints = (player, projectionMode = 'average') => {
    const espnId = allData.espnIdMap[player.id];
    const projection = espnId ? allData.projectionData[espnId] : null;
    
    if (!projection) return 0;
    
    switch (projectionMode) {
        case 'week':
            return projection.weekProjection || 0;
        case 'average':
            return projection.seasonProjection || 0;
        case 'season':
            return (projection.seasonProjection || 0) * 17;
        default:
            return projection.seasonProjection || 0;
    }
};

// ==================================================================
// == SECTION 2: ORIGINAL APPLICATION LOGIC (DATA FETCHING & PROCESSING)
// ==================================================================

async function fetchSleeperData() {
    try {
        const [leagueResponse, rostersResponse, usersResponse, playersResponse] = await Promise.all([
            fetch(`https://api.sleeper.app/v1/league/${CONFIG.sleeper.leagueId}`),
            fetch(`https://api.sleeper.app/v1/league/${CONFIG.sleeper.leagueId}/rosters`),
            fetch(`https://api.sleeper.app/v1/league/${CONFIG.sleeper.leagueId}/users`),
            fetch('https://api.sleeper.app/v1/players/nfl')
        ]);
        return {
            league: await leagueResponse.json(),
            rosters: await rostersResponse.json(),
            users: await usersResponse.json(),
            players: await playersResponse.json()
        };
    } catch (error) {
        console.error('Error fetching Sleeper data:', error);
        throw new Error('Failed to fetch league data from Sleeper');
    }
}

async function fetchFantasyCalcValues() {
    try {
        const response = await fetch(CONFIG.fantasyCalc.url);
        const data = await response.json();
        const valueMap = {};
        const espnIdMap = {};
        data.forEach(player => {
            if (player.player.sleeperId) {
                valueMap[player.player.sleeperId] = player.value;
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
        const response = await fetch(`espndata/player_data.json?t=${Date.now()}`);
        const data = await response.json();
        const projectionMap = {};
        
        // Extract week number from the first player's data
        let weekNumber = 1; // Default fallback
        if (data.length > 0) {
            // Extract week number from the key (e.g., "week_1_projection" -> 1)
            const weekKey = Object.keys(data[0]).find(key => key.startsWith('week_') && key.includes('_projection'));
            if (weekKey) {
                const match = weekKey.match(/week_(\d+)_projection/);
                if (match) {
                    weekNumber = parseInt(match[1]);
                }
            }
        }
        
        // Store week number globally for use in labels
        window.currentWeekNumber = weekNumber;
        
        data.forEach(player => {
            const weekKey = `week_${weekNumber}_projection`;
            projectionMap[player.playerId] = {
                weekProjection: player[weekKey]?.projected_points || 0,
                seasonProjection: player.season_projection?.projected_avg_points || 0
            };
        });
        
        console.log('Projection data loaded:', {
            weekNumber,
            totalPlayers: data.length,
            samplePlayer: data[0],
            projectionMapSize: Object.keys(projectionMap).length,
            sampleProjection: projectionMap[data[0]?.playerId]
        });
        
        // Update dropdown options with the correct week number
        updateProjectionModeDropdownOptions(weekNumber);
        
        return projectionMap;
    } catch (error) {
        console.warn('Projection data not available, continuing without it');
        return {};
    }
}

function processRosterData() {
    console.log('Processing roster data. Total rosters:', allData.rosters.length);
    
    const processedRosters = allData.rosters.map(roster => {
        const user = allData.users.find(u => u.user_id === roster.owner_id);
        const teamName = user?.metadata?.team_name || user?.display_name || 'Unknown Team';
        
        console.log('Processing roster:', { rosterId: roster.roster_id, teamName, userId: roster.owner_id });
        
        const rosterPlayers = [...new Set([...(roster.players || []), ...(roster.starters || [])])]
            .map(playerId => {
                const player = allData.players[playerId];
                if (!player || CONFIG.positions.excluded.includes(player.position)) return null;
                
                const rawValue = allData.playerValues[playerId] || 0;
                let displayValue = (appState.valueNormalization === 'normalized') 
                    ? normalizeValue(rawValue, getMaxPlayerValue(allData.playerValues)) 
                    : rawValue;
                
                return {
                    id: playerId, name: `${player.first_name} ${player.last_name}`,
                    position: player.position, team: player.team || 'FA',
                    value: displayValue, rawValue,
                    isStarter: roster.starters?.includes(playerId) || false
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.value - a.value);
        
        const actualPositionRoster = organizePlayersByActualPosition(rosterPlayers);
        const starterPlayers = rosterPlayers.filter(p => p.isStarter);
        const totalWeeklyPoints = starterPlayers.reduce((sum, player) => {
            const espnId = allData.espnIdMap[player.id];
            const projection = espnId ? allData.projectionData[espnId] : null;
            if (espnId && !projection) {
                console.warn('Missing projection for player:', player.name, 'espnId:', espnId);
            }
            return sum + (projection?.seasonProjection || 0);
        }, 0);

        return {
            rosterId: roster.roster_id.toString(), // Ensure rosterId is a string for consistency
            teamName, user, players: rosterPlayers,
            organized: organizePlayersByPosition(rosterPlayers),
            actualPositionOrganized: actualPositionRoster,
            stats: {
                totalValue: rosterPlayers.reduce((sum, p) => sum + p.value, 0),
                starterValue: starterPlayers.reduce((sum, p) => sum + p.value, 0),
                totalWeeklyPoints,
                starterCount: starterPlayers.length,
                positionalScores: calculatePositionalScores(actualPositionRoster)
            }
        };
    });
    
    // Check for duplicate team names
    const teamNames = processedRosters.map(r => r.teamName);
    const duplicateNames = teamNames.filter((name, index) => teamNames.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
        console.warn('Duplicate team names found:', duplicateNames);
        console.log('All team names:', teamNames);
    }
    
    // Sort rosters: user's team first, then by selected sorting criteria
    return processedRosters.sort((a, b) => {
        // Always put user's team first
        if (a.user?.user_id === userAuth.userId) return -1;
        if (b.user?.user_id === userAuth.userId) return 1;
        
        // Then sort by the selected criteria
        switch (appState.teamSort) {
            case 'value':
                return b.stats.totalValue - a.stats.totalValue;
            case 'starter-value':
                return b.stats.starterValue - a.stats.starterValue;
            case 'weekly-points':
                return b.stats.totalWeeklyPoints - a.stats.totalWeeklyPoints;
            case 'name':
                return a.teamName.localeCompare(b.teamName);
            default:
                return b.stats.totalValue - a.stats.totalValue;
        }
    });
}

function organizePlayersByPosition(players) {
    const organized = { starters: {}, bench: [] };
    CONFIG.positions.starters.forEach(pos => { organized.starters[pos.name] = []; });
    const availablePlayers = [...players];
    
    CONFIG.positions.starters.forEach(positionDef => {
        for (let i = 0; i < positionDef.count; i++) {
            let bestPlayerIndex = -1, bestProjection = -1;
            availablePlayers.forEach((player, index) => {
                if (positionDef.positions.includes(player.position)) {
                    const projectedPoints = getPlayerProjectedPoints(player, appState.projectionMode);
                    if (projectedPoints > bestProjection) {
                        bestProjection = projectedPoints;
                        bestPlayerIndex = index;
                    }
                }
            });
            if (bestPlayerIndex >= 0) {
                organized.starters[positionDef.name].push(availablePlayers.splice(bestPlayerIndex, 1)[0]);
            }
        }
    });
    
    // Sort bench by projected points (not by value)
    organized.bench = availablePlayers.sort((a, b) => 
        getPlayerProjectedPoints(b, appState.projectionMode) - getPlayerProjectedPoints(a, appState.projectionMode)
    );
    
    return organized;
}

function organizePlayersByActualPosition(players) {
    console.log('organizePlayersByActualPosition: Input players:', players);
    const organized = { QB: [], RB: [], WR: [], TE: [] };
    players.forEach(player => { if (organized[player.position]) organized[player.position].push(player); });
    
    // Sort by projected points instead of value
    Object.keys(organized).forEach(pos => {
        organized[pos].sort((a, b) => 
            getPlayerProjectedPoints(b, appState.projectionMode) - getPlayerProjectedPoints(a, appState.projectionMode)
        );
    });
    
    console.log('organizePlayersByActualPosition: Output organized:', organized);
    return organized;
}

function calculatePositionalScores(organizedPlayers) {
    const scores = {};
    const positionWeights = {
        QB: { starters: 2, flexWeight: 0.6, depthWeight: 0.2 },
        RB: { starters: 2, flexWeight: 0.7, depthWeight: 0.3 },
        WR: { starters: 3, flexWeight: 0.65, depthWeight: 0.25 },
        TE: { starters: 1, flexWeight: 0.5, depthWeight: 0.15 }
    };
    const maxPlayerValue = getMaxPlayerValue(allData.playerValues);
    Object.keys(organizedPlayers).forEach(position => {
        const players = organizedPlayers[position] || [];
        const weights = positionWeights[position];
        if (!players.length || !weights) {
            scores[position] = { raw: 0, normalized: 0, playerCount: 0 };
            return;
        }
        let rawScore = 0;
        let normalizedScore = 0;
        players.forEach((player, i) => {
            const normVal = appState.valueNormalization === 'normalized' ? player.value : normalizeValue(player.rawValue, maxPlayerValue);
            const rawVal = player.rawValue;
            if (i < weights.starters) {
                normalizedScore += normVal;
                rawScore += rawVal;
            } else if (i < weights.starters + 2) {
                normalizedScore += normVal * weights.flexWeight;
                rawScore += rawVal * weights.flexWeight;
            } else {
                normalizedScore += normVal * weights.depthWeight;
                rawScore += rawVal * weights.depthWeight;
            }
        });
        scores[position] = { raw: Math.round(rawScore), normalized: Math.round(normalizedScore), playerCount: players.length };
    });
    return scores;
}

function calculateOverallPositionalScore(positionalScores) {
    const positions = ['QB', 'RB', 'WR', 'TE'];
    let totalScore = 0;
    let validPositions = 0;
    positions.forEach(position => {
        if (positionalScores[position] && typeof positionalScores[position].normalized === 'number') {
            totalScore += positionalScores[position].normalized;
            validPositions++;
        }
    });
    if (validPositions === 0) return 0;
    return Math.round(totalScore / validPositions);
}

function getScoreClass(score, position = null, allPositionalScores = null) {
    if (score === null || score === undefined || score === 0) return 'poor';
    if (allPositionalScores && position) {
        const positionScores = allPositionalScores
            .map(roster => roster.stats.positionalScores?.[position]?.normalized)
            .filter(score => score !== null && score !== undefined)
            .sort((a, b) => a - b);
        if (positionScores.length > 0) {
            const sortedScores = positionScores.sort((a, b) => a - b);
            const scoreIndex = sortedScores.findIndex(s => s >= score);
            const percentile = scoreIndex >= 0 ? (scoreIndex / sortedScores.length) * 100 : 0;
            if (percentile >= 70) return 'good';
            if (percentile >= 30) return 'average';
            return 'poor';
        }
    }
    if (score >= 55) return 'good';
    if (score >= 30) return 'average';
    return 'poor';
}

// ==================================================================
// == SECTION 3: ORIGINAL APPLICATION LOGIC (ROSTER ANALYZER UI & DOM)
// ==================================================================

function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'flex';
    document.getElementById('rostersContainer').style.display = 'none';
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
    document.getElementById('leagueName').textContent = allData.league?.name || 'Unknown League';
}

function populateTeamSelector() {
    console.log('Populating team selector with rosters:', allData.processedRosters.length);
    
    const optionsContainer = document.getElementById('teamSelectOptions');
    optionsContainer.querySelectorAll('.select-option:not([data-value="all"])').forEach(option => option.remove());
    
    allData.processedRosters.forEach(roster => {
        console.log('Adding team to selector:', { rosterId: roster.rosterId, teamName: roster.teamName });
        const option = document.createElement('div');
        option.className = 'select-option';
        option.setAttribute('data-value', roster.rosterId);
        option.innerHTML = `<input type="checkbox" id="team-${roster.rosterId}"><label for="team-${roster.rosterId}">${roster.teamName}</label>`;
        optionsContainer.appendChild(option);
    });
    
    // Add event listeners for team selection
    setupTeamSelectorEventListeners();
    
    // Now synchronize the checkbox states after DOM elements are created
    synchronizeCheckboxStates();
    updateTeamSelectorLabel();
    
    console.log('Team selector populated. Current state:', {
        selectedTeams: Array.from(appState.selectedTeams),
        totalRosters: allData.processedRosters.length
    });
}

function updateTeamSelectorLabel() {
    const label = document.getElementById('teamSelectLabel');
    if (!allData.processedRosters || allData.processedRosters.length === 0) {
        label.textContent = 'No Teams Available'; 
        return;
    }
    
    const totalTeams = allData.processedRosters.length;
    
    // Check if "All Teams" is explicitly selected
    if (appState.selectedTeams.has('all')) {
        label.textContent = 'All Teams';
        console.log('Team selector: "All Teams" selected');
        return;
    }
    
    // Count only explicitly selected individual teams
    const selectedIndividualTeams = Array.from(appState.selectedTeams).filter(id => id !== 'all');
    const selectedCount = selectedIndividualTeams.length;
    
    console.log('Team selector state:', {
        totalTeams,
        selectedTeams: Array.from(appState.selectedTeams),
        selectedIndividualTeams,
        selectedCount
    });
    
    if (selectedCount === 0) {
        label.textContent = 'No Teams Selected';
    } else if (selectedCount === 1) {
        const selectedRosterId = selectedIndividualTeams[0];
        const team = allData.processedRosters.find(r => r.rosterId.toString() === selectedRosterId);
        label.textContent = team ? team.teamName : '1 Team Selected';
    } else {
        label.textContent = `${selectedCount} Teams Selected`;
    }
}

function handleTeamSelection(rosterId, isChecked) {
    console.log('Team selection:', { rosterId, isChecked, currentState: Array.from(appState.selectedTeams) });
    
    if (rosterId === 'all') {
        // Clear all selections and set "all" if checked
        appState.selectedTeams.clear();
        if (isChecked) {
            appState.selectedTeams.add('all');
        }
    } else {
        // Remove "all" when selecting individual teams
        appState.selectedTeams.delete('all');
        
        if (isChecked) {
            appState.selectedTeams.add(rosterId);
        } else {
            appState.selectedTeams.delete(rosterId);
        }
    }
    
    console.log('Team selection after update:', { newState: Array.from(appState.selectedTeams) });
    
    synchronizeCheckboxStates();
    updateTeamSelectorLabel();
    applyFiltersAndRender();
}

function synchronizeCheckboxStates() {
    console.log('Synchronizing checkbox states. Current appState:', Array.from(appState.selectedTeams));
    
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        // Check "All Teams" only if it's explicitly selected
        const shouldCheckAll = appState.selectedTeams.has('all');
        selectAllCheckbox.checked = shouldCheckAll;
        console.log('Select all checkbox:', { shouldCheckAll, actual: selectAllCheckbox.checked });
    }
    
    allData.processedRosters.forEach(roster => {
        const checkbox = document.getElementById(`team-${roster.rosterId}`);
        if (checkbox) {
            // When "All Teams" is selected, check all individual team checkboxes
            // When individual teams are selected, only check those specific ones
            const shouldCheck = appState.selectedTeams.has('all') || appState.selectedTeams.has(roster.rosterId.toString());
            checkbox.checked = shouldCheck;
            console.log(`Team ${roster.teamName} checkbox:`, { shouldCheck, actual: checkbox.checked });
        }
    });
}

function applyFiltersAndRender() {
    let filteredRosters = [...allData.processedRosters];
    
    // If "All Teams" is selected, show all teams
    // If individual teams are selected, filter to only those teams
    if (!appState.selectedTeams.has('all') && appState.selectedTeams.size > 0) {
        filteredRosters = filteredRosters.filter(roster => appState.selectedTeams.has(roster.rosterId.toString()));
    }
    
    console.log('Filtering rosters:', {
        totalRosters: allData.processedRosters.length,
        selectedTeams: Array.from(appState.selectedTeams),
        hasAll: appState.selectedTeams.has('all'),
        filteredCount: filteredRosters.length,
        filteredTeams: filteredRosters.map(r => ({ id: r.rosterId, name: r.teamName }))
    });
    
    filteredRosters = filteredRosters.map(roster => {
        let players = roster.players;
        let organized;
        
        // Handle the new combined view system
        if (appState.rosterView === 'optimal') {
            // Optimal Roster: starters are filled correctly and bench is sorted by value
            organized = organizePlayersByPosition(players);
        } else if (appState.rosterView === 'all-players') {
            // All Players: straight high-to-low list of every player
            organized = organizePlayersByPosition(players);
            // Sort all players by value (starters and bench combined)
            const allPlayers = [];
            Object.values(organized.starters).forEach(positionPlayers => allPlayers.push(...positionPlayers));
            if (organized.bench) allPlayers.push(...organized.bench);
            allPlayers.sort((a, b) => b.value - a.value);
            organized = { all: allPlayers };
        } else if (appState.rosterView === 'position-groups') {
            // Position Groups: players grouped by position with overall scores
            organized = organizePlayersByActualPosition(players);
        }
        
        return { ...roster, organized };
    });
    
    console.log('Sorting teams by:', appState.teamSort);
    
    // First, separate user's team from other teams
    const userTeam = filteredRosters.find(r => r.user?.user_id === userAuth.userId);
    const otherTeams = filteredRosters.filter(r => r.user?.user_id !== userAuth.userId);
    
    // Sort other teams by the selected criteria
    otherTeams.sort((a, b) => {
        switch (appState.teamSort) {
            case 'starter-value': return b.stats.starterValue - a.stats.starterValue;
            case 'weekly-points': return b.stats.totalWeeklyPoints - a.stats.totalWeeklyPoints;
            case 'name': return a.teamName.localeCompare(b.teamName);
            default: return b.stats.totalValue - a.stats.totalValue;
        }
    });
    
    // Reconstruct the array with user's team first, then sorted other teams
    filteredRosters = userTeam ? [userTeam, ...otherTeams] : otherTeams;
    
    console.log('Sorted teams:', filteredRosters.map(r => ({ name: r.teamName, sortValue: appState.teamSort === 'starter-value' ? r.stats.starterValue : appState.teamSort === 'weekly-points' ? r.stats.totalWeeklyPoints : r.stats.totalValue })));
    
    // Add visual indicator of sort order
    filteredRosters.forEach((roster, index) => {
        console.log(`${index + 1}. ${roster.teamName} - Sort Value: ${appState.teamSort === 'starter-value' ? roster.stats.starterValue : appState.teamSort === 'weekly-points' ? roster.stats.totalWeeklyPoints : roster.stats.totalValue }`);
    });
    
    renderRosters(filteredRosters);
}

function renderRosters(rosters) {
    console.log('Rendering rosters:', rosters.length);
    console.log('Roster details:', rosters.map(r => ({ id: r.rosterId, name: r.teamName })));
    
    const container = document.getElementById('rostersGrid');
    container.innerHTML = '';
    
    if (rosters.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 2rem;"><p>No teams match your current filters</p></div>`; 
        return;
    }
    
    // Set the team count attribute for responsive layout
    container.setAttribute('data-team-count', rosters.length.toString());
    

    
    const maxData = appState.rosterView === 'position-groups' ? getMaxPlayersPerPosition(rosters) : null;
    
    // Calculate actual ranks based on sort criteria (including user's team)
    const allTeamsSorted = [...rosters].sort((a, b) => {
        switch (appState.teamSort) {
            case 'value':
                return b.stats.totalValue - a.stats.totalValue;
            case 'starter-value':
                return b.stats.starterValue - a.stats.starterValue;
            case 'weekly-points':
                return b.stats.totalWeeklyPoints - a.stats.totalWeeklyPoints;
            case 'name':
                return a.teamName.localeCompare(b.teamName);
            default:
                return b.stats.totalValue - a.stats.totalValue;
        }
    });
    
    // Create a map of roster ID to actual rank
    const rankMap = new Map();
    allTeamsSorted.forEach((roster, index) => {
        rankMap.set(roster.rosterId, index + 1);
    });
    
    // Calculate individual stat rankings
    const statRankings = calculateIndividualStatRankings(rosters);
    
    rosters.forEach((roster, index) => {
        console.log(`Creating roster card ${index + 1}:`, { id: roster.rosterId, name: roster.teamName });
        // Use actual rank from the sort criteria for ALL teams
        const actualRank = rankMap.get(roster.rosterId);
        const card = createRosterCard(roster, maxData, actualRank, statRankings);
        card.setAttribute('data-roster-id', roster.rosterId);
        container.appendChild(card);
    });
    
    console.log('Roster rendering complete. Total cards created:', container.children.length);
}

function getMaxPlayersPerPosition(rosters) {
    const maxCounts = { QB: 0, RB: 0, WR: 0, TE: 0 };
    const maxHeights = { QB: 0, RB: 0, WR: 0, TE: 0 };
    
    rosters.forEach(roster => {
        Object.keys(maxCounts).forEach(position => {
            const count = (roster.organized[position] || []).length;
            maxCounts[position] = Math.max(maxCounts[position], count);
            
            // Calculate height needed for this position (header + column headers + players + spacing)
            const headerHeight = 60; // position header height
            const columnHeaderHeight = 40; // column headers height
            const playerRowHeight = 50; // each player row height
            const spacing = 20; // margins and padding
            
            const totalHeight = headerHeight + columnHeaderHeight + (count * playerRowHeight) + spacing;
            maxHeights[position] = Math.max(maxHeights[position], totalHeight);
        });
    });
    
    return { counts: maxCounts, heights: maxHeights };
}

function calculateIndividualStatRankings(rosters) {
    // Calculate rankings for each individual stat
    const totalValueRankings = new Map();
    const starterValueRankings = new Map();
    const weeklyPointsRankings = new Map();
    
    // Sort rosters by each stat and create ranking maps
    const totalValueSorted = [...rosters].sort((a, b) => b.stats.totalValue - a.stats.totalValue);
    const starterValueSorted = [...rosters].sort((a, b) => b.stats.starterValue - a.stats.starterValue);
    const weeklyPointsSorted = [...rosters].sort((a, b) => b.stats.totalWeeklyPoints - a.stats.totalWeeklyPoints);
    
    totalValueSorted.forEach((roster, index) => {
        totalValueRankings.set(roster.rosterId, index + 1);
    });
    
    starterValueSorted.forEach((roster, index) => {
        starterValueRankings.set(roster.rosterId, index + 1);
    });
    
    weeklyPointsSorted.forEach((roster, index) => {
        weeklyPointsRankings.set(roster.rosterId, index + 1);
    });
    
    return {
        totalValue: totalValueRankings,
        starterValue: starterValueRankings,
        weeklyPoints: weeklyPointsRankings
    };
}

function createRosterCard(roster, maxData = null, rank = null, statRankings = null) {
    const card = document.createElement('div');
    card.className = 'roster-card';
    
    // Add user-team class if this is the user's team
    if (roster.user?.user_id === userAuth.userId) {
        card.classList.add('user-team');
    }
    
            card.setAttribute('data-view-mode', appState.rosterView);

    let rankHTML = '';
    if (rank) {
        rankHTML = `<div class="rank-badge">${rank}</div>`;
    }
    // Get the ranking label based on sort criteria
    const rankingLabel = appState.teamSort === 'value' ? 'Total Value' : 
                        appState.teamSort === 'starter-value' ? 'Starter Value' : 
                        appState.teamSort === 'weekly-points' ? 'Weekly Points' : 
                        appState.teamSort === 'name' ? 'Alphabetical' : 
                        'Total Value';
    
    card.innerHTML = `
        <div class="roster-header">
            <div class="ranking-container">
                <div class="ranking-label">${rankingLabel}</div>
                ${rankHTML}
            </div>
            <h3>${roster.teamName}</h3>
        </div>
        <div class="roster-subheader">
            <div class="stat rank-${statRankings ? statRankings.totalValue.get(roster.rosterId) : rank}"><div class="stat-value">${formatValue(roster.stats.totalValue)}</div><div>Total Value</div></div>
            <div class="stat rank-${statRankings ? statRankings.starterValue.get(roster.rosterId) : rank}"><div class="stat-value">${formatValue(roster.stats.starterValue)}</div><div>Starter Value</div></div>
            <div class="stat rank-${statRankings ? statRankings.weeklyPoints.get(roster.rosterId) : rank}"><div class="stat-value">${roster.stats.totalWeeklyPoints.toFixed(1)}</div><div>Weekly Points</div></div>
        </div>
        <div class="roster-body">
            ${createPositionSections(roster, maxData)}
        </div>`;
    return card;
}

// ** THIS IS ONE OF THE RESTORED FUNCTIONS **
function createPositionSections(roster, maxData = null) {
    let html = '';
    
    if (appState.rosterView === 'position-groups') {
        const positions = ['QB', 'RB', 'WR', 'TE'];
        const organized = roster.organized || {};
        const positionalScores = roster.stats.positionalScores || {};
        html += '<div class="scoring-explanation"><div class="explanation-text">Positional scores (0-100) weight starters highest, then flex depth, then additional depth</div></div>';
        html += '<div class="positional-scores-summary"><div class="summary-header">Positional Scores Summary</div><div class="summary-table">';
        html += '<div class="summary-row header"><div class="summary-cell">Position</div><div class="summary-cell">Score</div><div class="summary-cell">Players</div></div>';
        positions.forEach(pos => {
            const posScore = positionalScores[pos];
            if (posScore) {
                html += `<div class="summary-row">
                    <div class="summary-cell position-name">${pos}</div>
                    <div class="summary-cell"><span class="position-score score-${getScoreClass(posScore.normalized, pos, allData.processedRosters)}">${posScore.normalized}</span></div>
                    <div class="summary-cell">${posScore.playerCount}</div>
                </div>`;
            }
        });
        html += '</div></div>';
        
        positions.forEach(position => {
            const players = organized[position] || [];
            const maxPlayers = maxData ? maxData.counts[position] : players.length;
            const maxHeight = maxData ? maxData.heights[position] : null;
            const positionScore = positionalScores[position];
            
            if (maxPlayers > 0) {
                const styleAttr = maxHeight ? `style="min-height: ${maxHeight}px;"` : '';
                html += `<div class="position-section" data-position="${position}" ${styleAttr}>
                    <div class="position-header">
                        ${position} <span class="position-count">Position Count: ${players.length}</span>
                        ${positionScore ? `<span class="position-score score-${getScoreClass(positionScore.normalized, position, allData.processedRosters)}">Position Score: ${positionScore.normalized}</span>` : ''}
                    </div>
                    <div class="column-headers"><div class="header-player">Player</div><div class="header-projection">Projection</div><div class="header-value">Value</div></div>`;
                
                // Add all players
                players.forEach(player => { 
                    html += createPlayerRow(player); 
                });
                
                // Add empty rows to match the maximum height needed for alignment
                for (let i = players.length; i < maxPlayers; i++) {
                    html += `<div class="player-row empty">
                        <div class="player-info">
                            <div class="player-name">-</div>
                            <div class="player-details">-</div>
                        </div>
                        <div class="position-badge">-</div>
                        <div class="player-projection">-</div>
                        <div class="player-value">-</div>
                    </div>`;
                }
                
                html += '</div>';
            }
        });
    } else if (appState.rosterView === 'all-players') {
        // All Players: straight high-to-low list of every player
        const allPlayers = roster.organized?.all || [];
        if (allPlayers.length > 0) {
            html += '<div class="position-section"><div class="position-header">ALL PLAYERS <span class="position-count">Position Count: ' + allPlayers.length + '</span></div>';
            html += '<div class="column-headers"><div class="header-player">Player</div><div class="header-position">Position</div><div class="header-projection">Projection</div><div class="header-value">Value</div></div>';
            allPlayers.forEach(player => { html += createPlayerRow(player); });
            html += '</div>';
        }
    } else {
        // Optimal Roster: starters are filled correctly and bench is sorted by value
        const organized = roster.organized || {};
        
        html += '<div class="position-section"><div class="position-header">STARTERS <span class="position-count">Position Count: 10</span></div>';
        html += '<div class="column-headers"><div class="header-player">Player</div><div class="header-position">Position</div><div class="header-projection">Projection</div><div class="header-value">Value</div></div>';
        CONFIG.positions.starters.forEach(positionDef => {
            const players = organized.starters[positionDef.name] || [];
            html += `<div class="position-group"><div class="position-subheader">${positionDef.name}</div>`;
            for (let i = 0; i < positionDef.count; i++) {
                html += players[i] ? createPlayerRow(players[i]) : `<div class="player-row empty"><div class="player-info"><div class="player-name">Empty Slot</div></div></div>`;
            }
            html += '</div>';
        });
        html += '</div>';
        // Show bench
        if (organized.bench && organized.bench.length > 0) {
            html += `<div class="position-section"><div class="position-header">BENCH <span class="position-count">Position Count: ${organized.bench.length}</span></div>`;
            html += '<div class="column-headers"><div class="header-player">Player</div><div class="header-position">Position</div><div class="header-projection">Projection</div><div class="header-value">Value</div></div>';
            organized.bench.forEach(player => { html += createPlayerRow(player); });
            html += '</div>';
        }
    }
    return html;
}

// ** THIS IS THE SECOND RESTORED FUNCTION **
function createPlayerRow(player) {
    const espnId = allData.espnIdMap[player.id];
    const projection = espnId ? allData.projectionData[espnId] : null;
    
    // Debug logging for projection lookup
    if (player.name.includes('Saquon') || player.name.includes('Barkley')) {
        console.log('Projection lookup for', player.name, ':', {
            playerId: player.id,
            espnId,
            projection,
            projectionMode: appState.projectionMode,
            allDataKeys: Object.keys(allData.projectionData || {})
        });
    }
    
    let projectionValue = 0;
    let projectionText = 'N/A';
    if (projection) {
        if (appState.projectionMode === 'week') projectionValue = projection.weekProjection;
        else if (appState.projectionMode === 'average') projectionValue = projection.seasonProjection;
        else projectionValue = projection.seasonProjection * 17;
        projectionText = projectionValue.toFixed(1);
    }
    return `
        <div class="player-row">
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-details">${player.team}</div>
            </div>
            <div class="position-badge">${player.position}</div>
            <div class="player-projection ${getProjectionClass(projectionValue, player.position, appState.projectionMode)}">${projectionText}</div>
            <div class="player-value ${getValueClass(player.value, player.position, appState.valueNormalization === 'normalized')}">${formatValue(player.value, appState.valueNormalization === 'normalized')}</div>
        </div>`;
}

// ==================================================================
// == SECTION 4: NEW TRADE CALCULATOR LOGIC
// ==================================================================

function switchView(view) {
    const rosterAnalyzer = document.getElementById('rostersContainer');
    const tradeCalculator = document.getElementById('tradeCalculatorContainer');
    const tradeSummary = document.getElementById('tradeSummary');
    const rosterBtn = document.getElementById('showRosterAnalyzerBtn');
    const tradeBtn = document.getElementById('showTradeCalculatorBtn');

    if (view === 'trade') {
        rosterAnalyzer.style.display = 'none';
        tradeCalculator.style.display = 'flex';
        tradeSummary.style.display = 'block';
        rosterBtn.classList.remove('active');
        tradeBtn.classList.add('active');
        if (tradeState.teams.length === 0 && allData.processedRosters.length > 0) {
            initTradeCalculator();
        } else if (tradeState.teams.length > 0) {
            // Update trade calculator display option labels to match current app state
            updateTradeDisplayOptionLabels();
        }
    } else { // 'analyzer'
        rosterAnalyzer.style.display = 'block';
        tradeCalculator.style.display = 'none';
        tradeSummary.style.display = 'none';
        rosterBtn.classList.add('active');
        tradeBtn.classList.remove('active');
    }
}

function initTradeCalculator() {
    console.log('Trade Calculator: Initializing...');
    console.log('Trade Calculator: allData.processedRosters:', allData.processedRosters);
    
    const tradeInterface = document.getElementById('tradeInterface');
    tradeInterface.innerHTML = '';
    tradeState = { teams: [], tradeParts: {}, viewMode: 'value' }; // Set default view mode to 'value'

    // Add sorting controls header
    const sortingHeader = document.createElement('div');
    sortingHeader.className = 'trade-sorting-header';
    sortingHeader.innerHTML = `
        <div class="sorting-controls">
            <label for="tradeTeamSortBy">Sort Teams:</label>
            <div class="custom-select">
                <div class="select-trigger" id="tradeTeamSortByTrigger">
                    <span id="tradeTeamSortByLabel">High to Low Value</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
                <div class="select-options" id="tradeTeamSortByOptions">
                    <div class="select-option" data-value="value">High to Low Value</div>
                    <div class="select-option" data-value="optimal">Starter Positions + Bench</div>
                    <div class="select-option" data-value="positional">Positional Overview</div>
                </div>
            </div>
        </div>
        
        <div class="trade-display-options">
            <div class="control-item">
                <label for="tradeProjectionMode">Projection Mode:</label>
                <div class="custom-select" id="tradeProjectionModeSelect">
                    <div class="select-trigger" id="tradeProjectionModeTrigger">
                        <span id="tradeProjectionModeLabel">Average</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="select-options" id="tradeProjectionModeOptions">
                        <div class="select-option" data-value="week">Week Projection</div>
                        <div class="select-option" data-value="average">Average</div>
                        <div class="select-option" data-value="season">Season Total</div>
                    </div>
                </div>
            </div>
            <div class="control-item">
                <label for="tradeValueDisplay">Value Display:</label>
                <div class="custom-select" id="tradeValueDisplaySelect">
                    <div class="select-trigger" id="tradeValueDisplayTrigger">
                        <span id="tradeValueDisplayLabel">Raw Values</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                    <div class="select-options" id="tradeValueDisplayOptions">
                        <div class="select-option" data-value="raw">Raw Values</div>
                        <div class="select-option" data-value="normalized">Normalized (0-100)</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    tradeInterface.appendChild(sortingHeader);

    // Add event listeners for sorting
    setupTradeSortingControls();
    
    // Update trade calculator display option labels to match current app state
    updateTradeDisplayOptionLabels();

    // Always use the user's team as team 1 (first team)
    const userRoster = allData.processedRosters.find(r => r.user?.user_id === userAuth.userId);
    const otherRoster = allData.processedRosters.find(r => r.user?.user_id !== userAuth.userId);

    if (userRoster) addTradeTeam(userRoster.rosterId);
    if (otherRoster) addTradeTeam(otherRoster.rosterId);
    renderAddTeamButton();
    
    // Set initial layout classes
    updateTradeInterfaceLayout();
}

function setupTradeSortingControls() {
    const trigger = document.getElementById('tradeTeamSortByTrigger');
    const options = document.getElementById('tradeTeamSortByOptions');
    const label = document.getElementById('tradeTeamSortByLabel');
    const select = trigger.closest('.custom-select');
    
    // Toggle dropdown
    trigger.addEventListener('click', () => {
        // Close other dropdowns first
        document.querySelectorAll('.custom-select').forEach(selectEl => {
            if (selectEl !== select) {
                selectEl.classList.remove('active');
            }
        });
        
        // Toggle this dropdown
        select.classList.toggle('active');
    });
    
    // Handle option selection
    options.querySelectorAll('.select-option').forEach(option => {
        option.addEventListener('click', () => {
            const value = option.dataset.value;
            const text = option.textContent;
            
            // Update label and close dropdown
            label.textContent = text;
            select.classList.remove('active');
            
            // Sort teams based on selection
            sortTradeTeams(value);
        });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!select.contains(e.target)) {
            select.classList.remove('active');
        }
    });
    
    // Setup trade projection mode controls
    setupTradeProjectionModeControls();
    
    // Setup trade value display controls
    setupTradeValueDisplayControls();
}

function sortTradeTeams(sortBy) {
    console.log('Trade Calculator: Changing view mode to:', sortBy);
    
    // Update the view mode based on selection
    if (sortBy === 'optimal') {
        tradeState.viewMode = 'optimal';
    } else if (sortBy === 'positional') {
        tradeState.viewMode = 'positional';
    } else {
        tradeState.viewMode = 'value'; // Default for 'value' - simple high to low
    }
    
    console.log('Trade Calculator: New view mode:', tradeState.viewMode);
    
    // Get current team order from DOM
    const currentOrder = [];
    tradeState.teams.forEach(team => {
        const columnEl = team.columnEl;
        if (columnEl && columnEl.parentNode) {
            currentOrder.push({
                rosterId: team.rosterId,
                columnEl: columnEl,
                team: allData.processedRosters.find(r => r.rosterId === team.rosterId)
            });
        }
    });
    
    if (currentOrder.length === 0) return;
    
    // Sort teams based on criteria
    currentOrder.sort((a, b) => {
        switch (sortBy) {
            case 'optimal':
                return b.team.stats.starterValue - a.team.stats.starterValue;
            case 'positional':
                return calculateOverallPositionalScore(b.team.stats.positionalScores) - calculateOverallPositionalScore(a.team.stats.positionalScores);
            case 'value':
            default:
                return b.team.stats.totalValue - a.team.stats.totalValue;
        }
    });
    
    // Reorder columns in DOM
    const tradeInterface = document.getElementById('tradeInterface');
    const addTeamContainer = document.getElementById('addTeamContainer');
    
    // Remove all team columns
    currentOrder.forEach(item => {
        if (item.columnEl.parentNode) {
            item.columnEl.remove();
        }
    });
    
    // Re-add in sorted order
    currentOrder.forEach(item => {
        if (addTeamContainer) {
            tradeInterface.insertBefore(item.columnEl, addTeamContainer);
        } else {
            tradeInterface.appendChild(item.columnEl);
        }
    });
    
    // Re-render all teams with the new view mode
    console.log('Trade Calculator: Re-rendering teams with view mode:', tradeState.viewMode);
    tradeState.teams.forEach(team => renderTeamRoster(team.rosterId, team.listElId));
}

function setupTradeProjectionModeControls() {
    const trigger = document.getElementById('tradeProjectionModeTrigger');
    const options = document.getElementById('tradeProjectionModeOptions');
    const label = document.getElementById('tradeProjectionModeLabel');
    const select = trigger.closest('.custom-select');
    
    // Toggle dropdown
    trigger.addEventListener('click', () => {
        // Close other dropdowns first
        document.querySelectorAll('.custom-select').forEach(selectEl => {
            if (selectEl !== select) {
                selectEl.classList.remove('active');
            }
        });
        
        // Toggle this dropdown
        select.classList.toggle('active');
    });
    
    // Handle option selection
    options.querySelectorAll('.select-option').forEach(option => {
        option.addEventListener('click', () => {
            const value = option.dataset.value;
            const text = option.textContent;
            
            // Update label and close dropdown
            label.textContent = text;
            select.classList.remove('active');
            
            // Update projection mode and re-render
            appState.projectionMode = value;
            tradeState.teams.forEach(team => renderTeamRoster(team.rosterId, team.listElId));
        });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!select.contains(e.target)) {
            select.classList.remove('active');
        }
    });
}

function setupTradeValueDisplayControls() {
    const trigger = document.getElementById('tradeValueDisplayTrigger');
    const options = document.getElementById('tradeValueDisplayOptions');
    const label = document.getElementById('tradeValueDisplayLabel');
    const select = trigger.closest('.custom-select');
    
    // Toggle dropdown
    trigger.addEventListener('click', () => {
        // Close other dropdowns first
        document.querySelectorAll('.custom-select').forEach(selectEl => {
            if (selectEl !== select) {
                selectEl.classList.remove('active');
            }
        });
        
        // Toggle this dropdown
        select.classList.toggle('active');
    });
    
    // Handle option selection
    options.querySelectorAll('.select-option').forEach(option => {
        option.addEventListener('click', () => {
            const value = option.dataset.value;
            const text = option.textContent;
            
            // Update label and close dropdown
            label.textContent = text;
            select.classList.remove('active');
            
            // Update value display mode and re-render
            appState.valueNormalization = value;
            tradeState.teams.forEach(team => renderTeamRoster(team.rosterId, team.listElId));
        });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!select.contains(e.target)) {
            select.classList.remove('active');
        }
    });
}

function updateTradeDisplayOptionLabels() {
    // Update projection mode label
    const projectionModeLabel = document.getElementById('tradeProjectionModeLabel');
    if (projectionModeLabel) {
        switch (appState.projectionMode) {
            case 'week':
                const weekNumber = window.currentWeekNumber || 1;
                projectionModeLabel.textContent = `Week ${weekNumber} Projection`;
                break;
            case 'average':
                projectionModeLabel.textContent = 'Average';
                break;
            case 'season':
                projectionModeLabel.textContent = 'Season Total';
                break;
        }
    }
    
    // Update value display label
    const valueDisplayLabel = document.getElementById('tradeValueDisplayLabel');
    if (valueDisplayLabel) {
        switch (appState.valueNormalization) {
            case 'raw':
                valueDisplayLabel.textContent = 'Raw Values';
                break;
            case 'normalized':
                valueDisplayLabel.textContent = 'Normalized (0-100)';
                break;
        }
    }
}

function addTradeTeam(rosterId = null) {
    if (tradeState.teams.length >= 3) return;

    if (!rosterId) {
        const teamIdsInTrade = tradeState.teams.map(t => t.rosterId);
        const availableTeam = allData.processedRosters.find(r => !teamIdsInTrade.includes(r.rosterId));
        if (availableTeam) rosterId = availableTeam.rosterId;
        else return;
    }

    const tradeInterface = document.getElementById('tradeInterface');
    const columnEl = document.createElement('div');
    columnEl.className = 'trade-team-column';
    const teamIndex = tradeState.teams.length;
    const columnId = `trade-team-${teamIndex}`;
    
    let optionsHtml = allData.processedRosters.map(roster =>
        `<option value="${roster.rosterId}" ${roster.rosterId === rosterId ? 'selected' : ''}>${roster.teamName}</option>`
    ).join('');

    // Add remove button for the third team (small x in header)
    const removeButtonHtml = teamIndex === 2 ? `
        <button class="remove-team-x" id="${columnId}-remove" title="Remove Team">
            <i class="fas fa-times"></i>
        </button>
    ` : '';

    columnEl.innerHTML = `
        <div class="trade-team-header">
            <select id="${columnId}-select">${optionsHtml}</select>
            ${removeButtonHtml}
        </div>
        <div class="trade-player-list" id="${columnId}-list"></div>`;

    let addTeamBtn = document.getElementById('addTeamContainer');
    if(addTeamBtn) {
        tradeInterface.insertBefore(columnEl, addTeamBtn);
    } else {
        tradeInterface.appendChild(columnEl);
    }

    const selectEl = document.getElementById(`${columnId}-select`);
    selectEl.addEventListener('change', (e) => handleTeamChange(e.target.value, teamIndex));

    // Add event listener for remove button if it's the third team
    if (teamIndex === 2) {
        const removeBtn = document.getElementById(`${columnId}-remove`);
        removeBtn.addEventListener('click', () => removeTradeTeam(teamIndex));
    }

    console.log('Trade Calculator: Adding team with rosterId:', rosterId);
    console.log('Trade Calculator: Team data:', allData.processedRosters.find(r => r.rosterId === rosterId));
    
    tradeState.teams.push({ rosterId, columnEl, listElId: `${columnId}-list`, selectElId: `${columnId}-select` });
    tradeState.tradeParts[rosterId] = { sending: new Map(), receiving: new Map() };

    renderTeamRoster(rosterId, `${columnId}-list`);
    calculateAndDisplayTrade();
    
    // Update the trade interface layout classes
    updateTradeInterfaceLayout();
}

function removeTradeTeam(teamIndex) {
    if (teamIndex !== 2 || tradeState.teams.length !== 3) return;
    
    const teamToRemove = tradeState.teams[teamIndex];
    
    // Remove the team's column from the DOM
    teamToRemove.columnEl.remove();
    
    // Remove from trade state
    tradeState.teams.splice(teamIndex, 1);
    delete tradeState.tradeParts[teamToRemove.rosterId];
    
    // Clear any trade parts involving the removed team
    Object.keys(tradeState.tradeParts).forEach(rosterId => {
        const parts = tradeState.tradeParts[rosterId];
        // Remove any players that were being sent to or received from the removed team
        for (const [playerId, player] of parts.sending) {
            if (tradeState.teams.some(t => t.rosterId === playerId)) continue;
            parts.sending.delete(playerId);
        }
        for (const [playerId, player] of parts.receiving) {
            if (tradeState.teams.some(t => t.rosterId === playerId)) continue;
            parts.receiving.delete(playerId);
        }
    });
    
    // Re-render the add team button
    renderAddTeamButton();
    
    // Re-render all remaining team rosters
    renderAllTeamRosters();
    
    // Recalculate and display trade
    calculateAndDisplayTrade();
    
    // Update the trade interface layout classes
    updateTradeInterfaceLayout();
}

function updateTradeInterfaceLayout() {
    const tradeInterface = document.getElementById('tradeInterface');
    const teamCount = tradeState.teams.length;
    
    // Remove existing layout classes
    tradeInterface.classList.remove('one-team', 'two-teams', 'three-teams');
    
    // Add appropriate layout class based on team count
    if (teamCount === 1) {
        tradeInterface.classList.add('one-team');
    } else if (teamCount === 2) {
        tradeInterface.classList.add('two-teams');
    } else if (teamCount === 3) {
        tradeInterface.classList.add('three-teams');
    }
}

function handleTeamChange(newRosterId, teamIndex) {
    const oldRosterId = tradeState.teams[teamIndex].rosterId;
    const selectEl = document.getElementById(tradeState.teams[teamIndex].selectElId);
    
    if (tradeState.teams.some(t => t.rosterId === newRosterId)) {
        selectEl.value = oldRosterId; return;
    }

    delete tradeState.tradeParts[oldRosterId];
    tradeState.teams[teamIndex].rosterId = newRosterId;
    tradeState.tradeParts[newRosterId] = { sending: new Map(), receiving: new Map() };
    
    Object.keys(tradeState.tradeParts).forEach(rid => {
        tradeState.tradeParts[rid] = { sending: new Map(), receiving: new Map() };
    });

    renderAllTeamRosters();
    calculateAndDisplayTrade();
    
    // Update the trade interface layout classes
    updateTradeInterfaceLayout();
}

function renderAllTeamRosters() {
    tradeState.teams.forEach(team => renderTeamRoster(team.rosterId, team.listElId));
}

function renderTeamRoster(rosterId, listElId) {
    const listEl = document.getElementById(listElId);
    const roster = allData.processedRosters.find(r => r.rosterId === rosterId);
    if (!roster) { listEl.innerHTML = '<p>Select a team</p>'; return; }

    // Check if roster has the necessary data
    if (!roster.players || !roster.stats) {
        listEl.innerHTML = '<p>Team data not available</p>';
        return;
    }

    // Organize players based on the current view mode
    let organized;
    if (tradeState.viewMode === 'positional') {
        organized = organizePlayersByActualPosition(roster.players);
    } else {
        organized = roster.organized || organizePlayersByPosition(roster.players);
    }

    console.log('Trade Calculator: Rendering team', roster.teamName, 'with view mode:', tradeState.viewMode);
    console.log('Trade Calculator: Roster organized data:', organized);
    console.log('Trade Calculator: Roster stats:', roster.stats);
    console.log('Trade Calculator: Players count:', roster.players.length);

    let html = '';
    
    if (tradeState.viewMode === 'value') {
        // High to Low Value mode - simple sorted list
        const allPlayers = roster.players || [];
        const sortedPlayers = [...allPlayers].sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0));
        
        html += '<div class="scoring-explanation"><div class="explanation-text">Players sorted by total value (high to low)</div></div>';
        html += '<div class="column-headers"><div class="header-player">Player</div><div class="header-position">Position</div><div class="header-projection">Projection</div><div class="header-value">Value</div></div>';
        
        sortedPlayers.forEach(player => {
            html += createTradePlayerRow(player, rosterId);
        });
        
    } else if (tradeState.viewMode === 'positional') {
        // Positional Overview mode - show players by position with checkboxes
        const positions = ['QB', 'RB', 'WR', 'TE'];
        const positionalScores = roster.stats.positionalScores || {};
        
        html += '<div class="scoring-explanation"><div class="explanation-text">Positional scores (0-100) weight starters highest, then flex depth, then additional depth</div></div>';
        html += '<div class="positional-scores-summary"><div class="summary-header">Positional Scores Summary</div><div class="summary-table">';
        html += '<div class="summary-row header"><div class="summary-cell">Position</div><div class="summary-cell">Score</div><div class="summary-cell">Players</div></div>';
        
        positions.forEach(pos => {
            const posScore = positionalScores[pos];
            if (posScore) {
                html += `<div class="summary-row">
                    <div class="summary-cell position-name">${pos}</div>
                    <div class="summary-cell"><span class="position-score score-${getScoreClass(posScore.normalized, pos, allData.processedRosters)}">${posScore.normalized}</span></div>
                    <div class="summary-cell">${posScore.playerCount}</div>
                </div>`;
            }
        });
        html += '</div></div>';
        
        // Add column headers for the player list
        html += '<div class="column-headers"><div class="header-player">Player</div><div class="header-position">Position</div><div class="header-projection">Projection</div><div class="header-value">Value</div></div>';
        
        positions.forEach(position => {
            const players = organized[position] || [];
            console.log(`Trade Calculator: Position ${position} has ${players.length} players:`, players);
            if (players.length > 0) {
                html += `<div class="position-section">
                    <div class="position-header">
                        ${position} <span class="position-count">Position Count: ${players.length}</span>
                        ${positionalScores[position] ? `<span class="position-score score-${getScoreClass(positionalScores[position].normalized, position, allData.processedRosters)}">Position Score: ${positionalScores[position].normalized}</span>` : ''}
                    </div>`;
                players.forEach(player => { 
                    console.log(`Trade Calculator: Creating row for player:`, player);
                    html += createTradePlayerRow(player, rosterId); 
                });
                html += '</div>';
            }
        });
    } else {
        // Optimal Lineup mode (starter-value) - same as Roster Analyzer
        
        html += '<div class="position-section"><div class="position-header">STARTERS <span class="position-count">Position Count: 10</span></div>';
        html += '<div class="column-headers"><div class="header-player">Player</div><div class="header-position">Position</div><div class="header-projection">Projection</div><div class="header-value">Value</div></div>';
        
        CONFIG.positions.starters.forEach(positionDef => {
            const players = organized.starters[positionDef.name] || [];
            html += `<div class="position-group"><div class="position-subheader">${positionDef.name}</div>`;
            for (let i = 0; i < positionDef.count; i++) {
                html += players[i] ? createTradePlayerRow(players[i], rosterId) : `<div class="player-row empty"><div class="player-info"><div class="player-name">Empty Slot</div></div></div>`;
            }
            html += '</div>';
        });
        html += '</div>';
        
        if (organized.bench && organized.bench.length > 0) {
            html += `<div class="position-section"><div class="position-header">BENCH <span class="position-count">Position Count: ${organized.bench.length}</span></div>`;
            html += '<div class="column-headers"><div class="header-player">Player</div><div class="header-position">Position</div><div class="header-projection">Projection</div><div class="header-value">Value</div></div>';
            organized.bench.forEach(player => { 
                html += createTradePlayerRow(player, rosterId); 
            });
            html += '</div>';
        }
    }
    
    console.log('Trade Calculator: Generated HTML:', html);
    listEl.innerHTML = html;
    
    // Add event listeners for checkboxes
    const playerRows = listEl.querySelectorAll('.trade-player-row');
    console.log('Trade Calculator: Found player rows:', playerRows.length);
    playerRows.forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox') {
                const checkbox = row.querySelector('input[type="checkbox"]');
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });
    });

    listEl.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', handlePlayerSelection);
    });
}

function createTradePlayerRow(player, rosterId) {
    console.log('createTradePlayerRow: Creating row for player:', player);
    const espnId = allData.espnIdMap[player.id];
    const projection = espnId ? allData.projectionData[espnId] : null;
    let projectionValue = 0;
    let projectionText = 'N/A';
    if (projection) {
        if (appState.projectionMode === 'week') projectionValue = projection.weekProjection;
        else if (appState.projectionMode === 'average') projectionValue = projection.seasonProjection;
        else projectionValue = projection.seasonProjection * 17;
        projectionText = projectionValue.toFixed(1);
    }
    
    // Apply value normalization logic based on appState.valueNormalization
    let displayValue = player.value;
    if (appState.valueNormalization === 'normalized' && player.rawValue !== undefined) {
        // If normalization is requested and rawValue is available, normalize it
        displayValue = normalizeValue(player.rawValue, getMaxPlayerValue(allData.playerValues));
    } else if (appState.valueNormalization === 'normalized') {
        // If normalization is requested but no rawValue, use the current value (assuming it's already normalized)
        displayValue = player.value;
    }
    
    return `
    <div class="trade-player-row" data-player-id="${player.id}" data-roster-id="${rosterId}">
        <input type="checkbox" id="trade-${rosterId}-${player.id}">
        <div class="player-info">
            <div class="player-name">${player.name} <span class="player-team">${player.team || 'FA'}</span></div>
        </div>
        <div class="position-badge" data-position="${player.position}">${player.position}</div>
        <div class="player-projection ${getProjectionClass(projectionValue, player.position, appState.projectionMode)}">${projectionText}</div>
        <div class="player-value ${getValueClass(displayValue, player.position, appState.valueNormalization === 'normalized')}">${formatValue(displayValue, appState.valueNormalization === 'normalized')}</div>
    </div>`;
}

function renderAddTeamButton() {
    const tradeInterface = document.getElementById('tradeInterface');
    let existingButton = document.getElementById('addTeamContainer');
    if (existingButton) existingButton.remove();

    if (tradeState.teams.length < 3) {
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'addTeamContainer';
        buttonContainer.className = 'add-team-container';
        buttonContainer.innerHTML = `<button class="add-team-btn" id="addTeamBtn"><i class="fas fa-plus-circle"></i><span>Add Third Team</span></button>`;
        tradeInterface.appendChild(buttonContainer);
        document.getElementById('addTeamBtn').addEventListener('click', () => {
             addTradeTeam();
             renderAddTeamButton();
        });
    }
}

function handlePlayerSelection(event) {
    const checkbox = event.target;
    const playerRow = checkbox.closest('.trade-player-row');
    const playerId = playerRow.dataset.playerId;
    const fromRosterId = playerRow.dataset.rosterId;
    
    if (tradeState.teams.length === 2) {
        const toRosterId = tradeState.teams.find(t => t.rosterId !== fromRosterId).rosterId;
        updateTradeState(fromRosterId, toRosterId, playerId, checkbox.checked);
    } else {
        if (checkbox.checked) {
            showDestinationModal(fromRosterId, playerId, checkbox);
        } else {
            for (const team of tradeState.teams) {
                if (tradeState.tradeParts[team.rosterId]?.receiving.has(playerId)) {
                    updateTradeState(fromRosterId, team.rosterId, playerId, false);
                    break;
                }
            }
        }
    }
}

function showDestinationModal(fromRosterId, playerId, checkbox) {
    const modal = document.getElementById('destinationModal');
    const optionsContainer = document.getElementById('destinationOptions');
    optionsContainer.innerHTML = '';

    const destinationTeams = tradeState.teams.filter(t => t.rosterId !== fromRosterId);
    destinationTeams.forEach(team => {
        const teamData = allData.processedRosters.find(r => r.rosterId === team.rosterId);
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = teamData.teamName;
        btn.onclick = () => {
            updateTradeState(fromRosterId, team.rosterId, playerId, true);
            modal.style.display = 'none';
        };
        optionsContainer.appendChild(btn);
    });
    
    document.getElementById('cancelDestinationBtn').onclick = () => {
        checkbox.checked = false;
        modal.style.display = 'none';
    }
    modal.style.display = 'flex';
}

function updateTradeState(fromRosterId, toRosterId, playerId, isAdding) {
    const roster = allData.processedRosters.find(r => r.rosterId === fromRosterId);
    const playerObject = roster.players.find(p => p.id === playerId);
    
    if (isAdding) {
        tradeState.tradeParts[fromRosterId].sending.set(playerId, playerObject);
        tradeState.tradeParts[toRosterId].receiving.set(playerId, playerObject);
    } else {
        tradeState.tradeParts[fromRosterId].sending.delete(playerId);
        tradeState.tradeParts[toRosterId].receiving.delete(playerId);
    }
    calculateAndDisplayTrade();
}

function removePlayerFromTrade(playerId, rosterId, type) {
    // Find the team that has this player in their trade parts
    const team = tradeState.teams.find(t => t.rosterId === rosterId);
    if (!team) return;
    
    // Remove player from both sending and receiving maps
    if (type === 'sending') {
        tradeState.tradeParts[rosterId].sending.delete(playerId);
    } else if (type === 'receiving') {
        tradeState.tradeParts[rosterId].receiving.delete(playerId);
    }
    
    // Also remove from the other team's corresponding map
    tradeState.teams.forEach(otherTeam => {
        if (otherTeam.rosterId !== rosterId) {
            if (type === 'sending') {
                tradeState.tradeParts[otherTeam.rosterId].receiving.delete(playerId);
            } else if (type === 'receiving') {
                tradeState.tradeParts[otherTeam.rosterId].sending.delete(playerId);
            }
        }
    });
    
    // Update the trade display
    calculateAndDisplayTrade();
    
    // Also update the checkbox in the main roster view
    const playerRow = document.querySelector(`[data-player-id="${playerId}"]`);
    if (playerRow) {
        const checkbox = playerRow.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.checked = false;
            playerRow.classList.remove('involved');
        }
    }
}

function createPlayerCard(player, type, rosterId) {
    const espnId = allData.espnIdMap[player.id];
    const projection = espnId ? allData.projectionData[espnId] : null;
    let projectionValue = 0;
    let projectionText = 'N/A';
    if (projection) {
        if (appState.projectionMode === 'week') projectionValue = projection.weekProjection;
        else if (appState.projectionMode === 'average') projectionValue = projection.seasonProjection;
        else projectionValue = projection.seasonProjection * 17;
        projectionText = projectionValue.toFixed(1);
    }
    
    return `
    <div class="trade-summary-player-card ${type}" data-player-id="${player.id}" data-roster-id="${rosterId}">
        <div class="player-info">
            <div class="player-name">${player.name}</div>
            <div class="player-details">${player.team}</div>
        </div>
        <div class="position-badge" data-position="${player.position}">${player.position}</div>
        <div class="player-projection ${getProjectionClass(projectionValue, player.position, appState.projectionMode)}">${projectionText}</div>
        <div class="player-value ${getValueClass(player.value, player.position, appState.valueNormalization === 'normalized')}">${formatValue(player.value, appState.valueNormalization === 'normalized')}</div>
        <button class="remove-player-btn" onclick="removePlayerFromTrade('${player.id}', '${rosterId}', '${type}')" title="Remove from trade">
            <i class="fas fa-times"></i>
        </button>
    </div>`;
}

function calculateAndDisplayTrade() {
    const summaryContainer = document.getElementById('tradeSummary');
    let teamsSummaryData = [];

    tradeState.teams.forEach(team => {
        const rosterId = team.rosterId;
        const parts = tradeState.tradeParts[rosterId];
        const sendingArray = Array.from(parts.sending.values());
        const receivingArray = Array.from(parts.receiving.values());

        let sendingTotal = sendingArray.reduce((sum, p) => sum + p.rawValue, 0);
        const receivingTotal = receivingArray.reduce((sum, p) => sum + p.rawValue, 0);
        let taxInfo = '';

        tradeState.teams.forEach(otherTeam => {
            if (rosterId === otherTeam.rosterId) return;
            const playersSentToOther = sendingArray.filter(p => tradeState.tradeParts[otherTeam.rosterId].receiving.has(p.id));
            const playersReceivedFromOther = receivingArray.filter(p => tradeState.tradeParts[otherTeam.rosterId].sending.has(p.id));
            const sentCount = playersSentToOther.length;
            const receivedCount = playersReceivedFromOther.length;

            if (sentCount > receivedCount) {
                const valueOfSentPlayers = playersSentToOther.reduce((sum, p) => sum + p.rawValue, 0);
                let tax = 0;
                if (sentCount === 2 && receivedCount <= 1) tax = 0.075;
                if (sentCount === 3 && receivedCount === 2) tax = 0.075;
                if (sentCount === 3 && receivedCount <= 1) tax = 0.175;
                if (tax > 0) {
                    sendingTotal -= valueOfSentPlayers * tax;
                    taxInfo = `(-${(tax * 100).toFixed(1)}%) tax applied`;
                }
            }
        });
        teamsSummaryData.push({ 
            rosterId, 
            netValue: receivingTotal - sendingTotal, 
            taxInfo,
            sending: sendingArray,
            receiving: receivingArray
        });
    });
    
    summaryContainer.innerHTML = '<div class="trade-summary-teams"></div><div class="trade-summary-players"></div><div class="trade-lineup-comparison"></div>';
    const teamsContainer = summaryContainer.querySelector('.trade-summary-teams');
    const playersContainer = summaryContainer.querySelector('.trade-summary-players');
    const lineupComparisonContainer = summaryContainer.querySelector('.trade-lineup-comparison');
    
    // Display team summaries
    teamsSummaryData.forEach(data => {
        const teamInfo = allData.processedRosters.find(r => r.rosterId === data.rosterId);
        
        // Calculate total value being sent for threshold comparison
        const totalValueSent = data.sending.reduce((sum, p) => sum + p.rawValue, 0);
        const threshold = totalValueSent * 0.05; // 5% of total value being sent
        
        // Determine color based on net value and threshold
        let valueColor;
        if (data.netValue > 0) {
            valueColor = '#22c55e'; // Green for positive
        } else if (data.netValue >= -threshold) {
            valueColor = '#fbbf24'; // Yellow for negative but within 5% threshold
        } else {
            valueColor = '#dc2626'; // Red for more negative than 5% threshold
        }
        
        // Format the net value according to normalization setting
        let displayNetValue = data.netValue;
        if (appState.valueNormalization === 'normalized') {
            displayNetValue = normalizeValue(data.netValue, getMaxPlayerValue(allData.playerValues));
        }
        
        const summaryEl = document.createElement('div');
        summaryEl.className = 'trade-summary-team';
        summaryEl.innerHTML = `
            <div class="summary-team-name">${teamInfo.teamName}</div>
            <div class="summary-net-value" style="color: ${valueColor};">
                ${data.netValue >= 0 ? '+' : ''}${appState.valueNormalization === 'normalized' ? 
                    Math.round(displayNetValue) : 
                    Math.round(data.netValue).toLocaleString()}
            </div>
            <div class="summary-tax-info">${data.taxInfo}</div>`;
        teamsContainer.appendChild(summaryEl);
    });

    // Display player cards only if there are actual trades
    const hasAnyTrades = teamsSummaryData.some(data => data.sending.length > 0 || data.receiving.length > 0);
    
    if (hasAnyTrades) {
        teamsSummaryData.forEach(data => {
            const teamInfo = allData.processedRosters.find(r => r.rosterId === data.rosterId);
            const teamPlayersEl = document.createElement('div');
            teamPlayersEl.className = 'trade-summary-team-players';
            

            
            // Players being sent away
            if (data.sending.length > 0) {
                const sendingSection = document.createElement('div');
                sendingSection.className = 'trade-summary-section';
                sendingSection.innerHTML = '<h4 class="trade-summary-section-title sending">Sending Away</h4>';
                
                const sendingPlayers = document.createElement('div');
                sendingPlayers.className = 'trade-summary-player-cards';
                            data.sending.forEach(player => {
                const playerCardHtml = createPlayerCard(player, 'sending', data.rosterId);
                const playerCardEl = document.createElement('div');
                playerCardEl.innerHTML = playerCardHtml;
                sendingPlayers.appendChild(playerCardEl.firstElementChild);
            });
                sendingSection.appendChild(sendingPlayers);
                teamPlayersEl.appendChild(sendingSection);
            }
            
            // Players being received
            if (data.receiving.length > 0) {
                const receivingSection = document.createElement('div');
                receivingSection.className = 'trade-summary-section';
                receivingSection.innerHTML = '<h4 class="trade-summary-section-title receiving">Receiving</h4>';
                
                const receivingPlayers = document.createElement('div');
                receivingPlayers.className = 'trade-summary-player-cards';
                            data.receiving.forEach(player => {
                const playerCardHtml = createPlayerCard(player, 'receiving', data.rosterId);
                const playerCardEl = document.createElement('div');
                playerCardEl.innerHTML = playerCardHtml;
                receivingPlayers.appendChild(playerCardEl.firstElementChild);
            });
                receivingSection.appendChild(receivingPlayers);
                teamPlayersEl.appendChild(receivingSection);
            }
            
            playersContainer.appendChild(teamPlayersEl);
        });

        // Add lineup comparison button
        const lineupComparisonBtn = document.createElement('button');
        lineupComparisonBtn.className = 'btn btn-primary lineup-comparison-btn';
        lineupComparisonBtn.innerHTML = '<i class="fas fa-chart-line"></i> Compare Lineups';
        lineupComparisonBtn.onclick = () => generateLineupComparison(teamsSummaryData);
        lineupComparisonContainer.appendChild(lineupComparisonBtn);
    }

    const allInvolvedPlayerIds = new Set();
    Object.values(tradeState.tradeParts).forEach(part => {
        part.sending.forEach(p => allInvolvedPlayerIds.add(p.id));
    });

    document.querySelectorAll('.trade-player-row').forEach(row => {
        const checkbox = row.querySelector('input');
        if (allInvolvedPlayerIds.has(row.dataset.playerId)) {
            row.classList.add('involved');
            checkbox.checked = true;
        } else {
            row.classList.remove('involved');
            checkbox.checked = false;
        }
    });
}

function generateLineupComparison(teamsSummaryData) {
    const lineupComparisonContainer = document.querySelector('.trade-lineup-comparison');
    
    // Clear previous comparison
    lineupComparisonContainer.innerHTML = '';
    
    // Add loading state
    const loadingEl = document.createElement('div');
    loadingEl.className = 'lineup-comparison-loading';
    loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculating lineup comparisons...';
    lineupComparisonContainer.appendChild(loadingEl);
    
    // Use setTimeout to allow UI to update before heavy calculations
    setTimeout(() => {
        const comparisonResults = calculateLineupComparisons(teamsSummaryData);
        displayLineupComparisons(lineupComparisonContainer, comparisonResults);
    }, 100);
}

function calculateLineupComparisons(teamsSummaryData) {
    const results = [];
    
    teamsSummaryData.forEach(teamData => {
        const roster = allData.processedRosters.find(r => r.rosterId === teamData.rosterId);
        if (!roster) return;
        
        // Calculate pre-trade lineup
        const preTradeLineup = calculateOptimalLineup(roster.players);
        const preTradeStats = calculateLineupStats(preTradeLineup);
        
        // Calculate post-trade lineup
        const postTradePlayers = calculatePostTradeRoster(roster.players, teamData.sending, teamData.receiving);
        const postTradeLineup = calculateOptimalLineup(postTradePlayers);
        const postTradeStats = calculateLineupStats(postTradeLineup);
        
        // Track position changes for each player
        const positionChanges = calculatePositionChanges(preTradeLineup, postTradeLineup);
        
        results.push({
            teamName: roster.teamName,
            rosterId: teamData.rosterId,
            preTrade: {
                lineup: preTradeLineup,
                stats: preTradeStats
            },
            postTrade: {
                lineup: postTradeLineup,
                stats: postTradeStats
            },
            changes: {
                starterValue: postTradeStats.starterValue - preTradeStats.starterValue,
                totalValue: postTradeStats.totalValue - preTradeStats.totalValue,
                weeklyPoints: postTradeStats.weeklyPoints - preTradeStats.weeklyPoints
            },
            positionChanges: positionChanges,
            tradeInfo: {
                sending: teamData.sending,
                receiving: teamData.receiving
            }
        });
    });
    
    return results;
}

function calculateOptimalLineup(players) {
    // Create a copy of players to work with
    const availablePlayers = [...players];
    const lineup = {
        QB: [],
        RB: [],
        WR: [],
        TE: [],
        SFLEX: [],
        FLEX: []
    };
    
    // Sort players by projected points within each position
    const qbs = availablePlayers.filter(p => p.position === 'QB').sort((a, b) => 
        getPlayerProjectedPoints(b, appState.projectionMode) - getPlayerProjectedPoints(a, appState.projectionMode)
    );
    const rbs = availablePlayers.filter(p => p.position === 'RB').sort((a, b) => 
        getPlayerProjectedPoints(b, appState.projectionMode) - getPlayerProjectedPoints(a, appState.projectionMode)
    );
    const wrs = availablePlayers.filter(p => p.position === 'WR').sort((a, b) => 
        getPlayerProjectedPoints(b, appState.projectionMode) - getPlayerProjectedPoints(a, appState.projectionMode)
    );
    const tes = availablePlayers.filter(p => p.position === 'TE').sort((a, b) => 
        getPlayerProjectedPoints(b, appState.projectionMode) - getPlayerProjectedPoints(a, appState.projectionMode)
    );
    
    // Fill required positions
    if (qbs.length > 0) lineup.QB.push(qbs[0]);
    if (rbs.length > 0) lineup.RB.push(rbs[0]);
    if (rbs.length > 1) lineup.RB.push(rbs[1]);
    if (wrs.length > 0) lineup.WR.push(wrs[0]);
    if (wrs.length > 1) lineup.WR.push(wrs[1]);
    if (wrs.length > 2) lineup.WR.push(wrs[2]);
    if (tes.length > 0) lineup.TE.push(tes[0]);
    
    // Fill flex positions with best remaining players by projected points
    const remainingPlayers = [
        ...qbs.slice(1),
        ...rbs.slice(2),
        ...wrs.slice(3),
        ...tes.slice(1)
    ].sort((a, b) => 
        getPlayerProjectedPoints(b, appState.projectionMode) - getPlayerProjectedPoints(a, appState.projectionMode)
    );
    
    // SFLEX (can be QB)
    if (remainingPlayers.length > 0) {
        lineup.SFLEX.push(remainingPlayers[0]);
        remainingPlayers.splice(0, 1);
    }
    
    // FLEX positions (RB, WR, TE only)
    const flexEligible = remainingPlayers.filter(p => p.position !== 'QB');
    if (flexEligible.length > 0) {
        lineup.FLEX.push(flexEligible[0]);
        if (flexEligible.length > 1) {
            lineup.FLEX.push(flexEligible[1]);
        }
    }
    
    return lineup;
}

function calculateLineupStats(lineup) {
    let starterValue = 0;
    let totalValue = 0;
    let weeklyPoints = 0;
    
    Object.values(lineup).forEach(players => {
        players.forEach(player => {
            // Use raw value for calculations if normalization is selected, otherwise use the already-normalized value
            let valueToUse = player.value;
            if (appState.valueNormalization === 'normalized') {
                // If normalized is selected, we need to use the raw value for calculations
                // since the normalized value is just for display
                valueToUse = player.rawValue;
            }
            
            starterValue += valueToUse || 0;
            totalValue += valueToUse || 0;
            
            // Calculate weekly points from ESPN projections
            const espnId = allData.espnIdMap[player.id];
            const projection = espnId ? allData.projectionData[espnId] : null;
            if (projection) {
                if (appState.projectionMode === 'week') {
                    weeklyPoints += projection.weekProjection || 0;
                } else if (appState.projectionMode === 'average') {
                    weeklyPoints += projection.seasonProjection || 0;
                } else {
                    weeklyPoints += (projection.seasonProjection || 0) * 17;
                }
            }
        });
    });
    
    return { starterValue, totalValue, weeklyPoints };
}

function calculatePostTradeRoster(originalPlayers, sending, receiving) {
    // Remove players being sent away
    const playersAfterSending = originalPlayers.filter(p => !sending.find(s => s.id === p.id));
    
    // Add players being received
    const finalRoster = [...playersAfterSending, ...receiving];
    
    return finalRoster;
}

function displayLineupComparisons(container, results) {
    container.innerHTML = '';
    
    // Add header
    const header = document.createElement('h3');
    header.className = 'lineup-comparison-header';
    header.innerHTML = '<i class="fas fa-chart-line"></i> Lineup Comparison';
    container.appendChild(header);
    
    // Add legend
    const legend = document.createElement('div');
    legend.className = 'lineup-comparison-legend';
    legend.innerHTML = `
        <div class="legend-item">
            <span class="legend-color promoted"></span>
            <span class="legend-text">Promoted (Bench/Flex → Starter)</span>
        </div>
        <div class="legend-item">
            <span class="legend-color demoted"></span>
            <span class="legend-text">Demoted (Starter → Flex/Bench)</span>
        </div>
        <div class="legend-item">
            <span class="legend-color being-sent"></span>
            <span class="legend-text">Player Being Sent Away</span>
        </div>
        <div class="legend-item">
            <span class="legend-color being-received"></span>
            <span class="legend-text">Player Being Received</span>
        </div>
    `;
    container.appendChild(legend);
    
    // Create comparison cards for each team
    results.forEach(result => {
        const teamCard = createTeamLineupComparisonCard(result);
        container.appendChild(teamCard);
    });
}

function createTeamLineupComparisonCard(result) {
    const card = document.createElement('div');
    card.className = 'lineup-comparison-card';
    
    // Calculate change indicators
    const starterValueChange = result.changes.starterValue;
    const weeklyPointsChange = result.changes.weeklyPoints;
    
    const starterValueClass = starterValueChange > 0 ? 'positive' : starterValueChange < 0 ? 'negative' : 'neutral';
    const weeklyPointsClass = weeklyPointsChange > 0 ? 'positive' : weeklyPointsChange < 0 ? 'negative' : 'neutral';
    
    card.innerHTML = `
        <div class="lineup-comparison-team-header">
            <h4>${result.teamName}</h4>
            <div class="lineup-comparison-summary">
                <div class="summary-item ${starterValueClass}">
                    <span class="summary-label">Starter Value:</span>
                    <span class="summary-value">
                        ${starterValueChange > 0 ? '+' : ''}${appState.valueNormalization === 'normalized' ? 
                            Math.round(normalizeValue(starterValueChange, getMaxPlayerValue(allData.playerValues))) : 
                            Math.round(starterValueChange).toLocaleString()}
                    </span>
                </div>
                <div class="summary-item ${weeklyPointsClass}">
                    <span class="summary-label">Weekly Points:</span>
                    <span class="summary-value">
                        ${weeklyPointsChange > 0 ? '+' : ''}${weeklyPointsChange.toFixed(1)}
                    </span>
                </div>
            </div>
        </div>
        
        <div class="lineup-comparison-details">
            <div class="lineup-section">
                <h5>Pre-Trade Lineup</h5>
                <div class="lineup-stats">
                    <div class="stat-item">
                        <span class="stat-label">Starter Value:</span>
                        <span class="stat-value">${appState.valueNormalization === 'normalized' ? 
                            Math.round(normalizeValue(result.preTrade.stats.starterValue, getMaxPlayerValue(allData.playerValues))) : 
                            Math.round(result.preTrade.stats.starterValue).toLocaleString()}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Weekly Points:</span>
                        <span class="stat-value">${result.preTrade.stats.weeklyPoints.toFixed(1)}</span>
                    </div>
                </div>
                <div class="lineup-players">
                    ${renderLineupPlayers(result.preTrade.lineup, 'pre', result.tradeInfo, result.positionChanges)}
                </div>
            </div>
            
            <div class="lineup-section">
                <h5>Post-Trade Lineup</h5>
                <div class="lineup-stats">
                    <div class="stat-item">
                        <span class="stat-label">Starter Value:</span>
                        <span class="stat-value">${appState.valueNormalization === 'normalized' ? 
                            Math.round(normalizeValue(result.postTrade.stats.starterValue, getMaxPlayerValue(allData.playerValues))) : 
                            Math.round(result.postTrade.stats.starterValue).toLocaleString()}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Weekly Points:</span>
                        <span class="stat-value">${result.postTrade.stats.weeklyPoints.toFixed(1)}</span>
                    </div>
                </div>
                <div class="lineup-players">
                    ${renderLineupPlayers(result.postTrade.lineup, 'post', result.tradeInfo, result.positionChanges)}
                </div>
            </div>
        </div>
    `;
    
    return card;
}

function renderLineupPlayers(lineup, prefix, tradeInfo, positionChanges) {
    let html = '';
    
    Object.entries(lineup).forEach(([position, players]) => {
        if (players.length > 0) {
            html += `<div class="lineup-position">
                <div class="position-name">${position}</div>
                <div class="position-players">`;
            
            players.forEach(player => {
                const espnId = allData.espnIdMap[player.id];
                const projection = espnId ? allData.projectionData[espnId] : null;
                let projectionText = 'N/A';
                if (projection) {
                    if (appState.projectionMode === 'week') {
                        projectionText = projection.weekProjection?.toFixed(1) || 'N/A';
                    } else if (appState.projectionMode === 'average') {
                        projectionText = projection.seasonProjection?.toFixed(1) || 'N/A';
                    } else {
                        projectionText = ((projection.seasonProjection || 0) * 17).toFixed(1);
                    }
                }
                
                // Get the correct value to display (same as roster lists above)
                let displayValue = player.value;
                if (appState.valueNormalization === 'normalized' && player.rawValue !== undefined) {
                    displayValue = normalizeValue(player.rawValue, getMaxPlayerValue(allData.playerValues));
                }
                
                // Determine player classes for highlighting
                let playerClass = 'lineup-player';
                
                // Check for trade-related highlighting
                if (tradeInfo) {
                    if (prefix === 'pre' && tradeInfo.sending.some(p => p.id === player.id)) {
                        playerClass += ' player-being-sent';
                    } else if (prefix === 'post' && tradeInfo.receiving.some(p => p.id === player.id)) {
                        playerClass += ' player-being-received';
                    }
                }
                
                // Check for position change highlighting
                if (positionChanges) {
                    if (prefix === 'pre') {
                        // Pre-trade: highlight players being demoted
                        if (positionChanges.demoted.some(c => c.player.id === player.id)) {
                            playerClass += ' player-demoted';
                        } else if (positionChanges.starterToFlex.some(c => c.player.id === player.id)) {
                            playerClass += ' player-demoted';
                        }
                    } else if (prefix === 'post') {
                        // Post-trade: highlight players being promoted
                        if (positionChanges.promoted.some(c => c.player.id === player.id)) {
                            playerClass += ' player-promoted';
                        } else if (positionChanges.flexToStarter.some(c => c.player.id === player.id)) {
                            playerClass += ' player-promoted';
                        }
                    }
                }
                
                html += `<div class="${playerClass}">
                    <span class="player-name">${player.name}</span>
                    <span class="player-projection">${projectionText}</span>
                    <span class="player-value">${formatValue(displayValue, appState.valueNormalization === 'normalized')}</span>
                </div>`;
            });
            
            html += `</div></div>`;
        }
    });
    
    return html;
}

// ==================================================================
// == SECTION 5: EVENT LISTENERS & APP INITIALIZATION
// ==================================================================

function setupEventListeners() {
    document.getElementById('refreshBtn').addEventListener('click', loadAllData);
    document.getElementById('teamSelectTrigger').addEventListener('click', toggleTeamSelector);
    document.addEventListener('click', closeTeamSelectorOnOutsideClick);
    document.querySelectorAll('#roster-view-selector button').forEach(btn => btn.addEventListener('click', function() {
        document.querySelectorAll('#roster-view-selector button').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        handleRosterViewChange(this.getAttribute('data-view'));
    }));

    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('horizontalViewBtn').addEventListener('click', toggleHorizontalView);
    document.addEventListener('keydown', handleKeyboardShortcuts);
    document.getElementById('rostersGrid')?.addEventListener('scroll', updateScrollPositionIndicator, { passive: true });
    document.getElementById('showRosterAnalyzerBtn').addEventListener('click', () => switchView('analyzer'));
    document.getElementById('showTradeCalculatorBtn').addEventListener('click', () => switchView('trade'));
    
    // Setup projection mode and value display dropdowns
    setupProjectionModeDropdown();
    setupValueDisplayDropdown();
}

function setupProjectionModeDropdown() {
    const projectionModeSelect = document.getElementById('projectionModeSelect');
    if (projectionModeSelect) {
        const trigger = projectionModeSelect.querySelector('.select-trigger');
        const options = projectionModeSelect.querySelector('.select-options');
        
        if (trigger && options) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                projectionModeSelect.classList.toggle('active');
            });
            
            options.querySelectorAll('.select-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const value = option.dataset.value;
                    handleProjectionModeChange(value);
                    projectionModeSelect.classList.remove('active');
                    updateDisplayOptionLabels();
                });
            });
        }
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
        if (!projectionModeSelect?.contains(event.target)) {
            projectionModeSelect?.classList.remove('active');
        }
    });
}

function setupValueDisplayDropdown() {
    const valueDisplaySelect = document.getElementById('valueDisplaySelect');
    if (valueDisplaySelect) {
        const trigger = valueDisplaySelect.querySelector('.select-trigger');
        const options = valueDisplaySelect.querySelector('.select-options');
        
        if (trigger && options) {
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                valueDisplaySelect.classList.toggle('active');
            });
            
            options.querySelectorAll('.select-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const value = option.dataset.value;
                    handleValueNormalizationChange(value);
                    valueDisplaySelect.classList.remove('active');
                    updateDisplayOptionLabels();
                });
            });
        }
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
        if (!valueDisplaySelect?.contains(event.target)) {
            valueDisplaySelect?.classList.remove('active');
        }
    });
    
    // Initialize labels
    updateDisplayOptionLabels();
}

function setupCustomDropdowns() {
    console.log('Setting up custom dropdowns...');
    // Setup all custom select dropdowns
    const customSelects = document.querySelectorAll('.custom-select');
    console.log('Found custom selects:', customSelects.length);
    
    customSelects.forEach((select, index) => {
        const trigger = select.querySelector('.select-trigger');
        const options = select.querySelector('.select-options');
        
        console.log(`Dropdown ${index}:`, {
            id: select.id,
            hasTrigger: !!trigger,
            hasOptions: !!options,
            triggerText: trigger?.textContent?.trim(),
            optionsCount: options?.querySelectorAll('.select-option')?.length
        });
        
        if (!trigger || !options) return;
        
        // Skip team selector and display options dropdowns as they're handled separately
        if (select.id === 'teamSelect' || select.id === 'projectionModeSelect' || select.id === 'valueDisplaySelect') {
            console.log('Skipping dropdown:', select.id);
            return;
        }
        
        // Toggle dropdown on trigger click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Dropdown clicked:', select.id);
            
            // Close all other dropdowns first
            customSelects.forEach(otherSelect => {
                if (otherSelect !== select) {
                    otherSelect.classList.remove('active');
                }
            });
            
            // Toggle current dropdown
            select.classList.toggle('active');
            console.log('Dropdown active state:', select.classList.contains('active'));
            
            // Debug: Check if options are visible
            if (select.classList.contains('active')) {
                const optionsEl = select.querySelector('.select-options');
                console.log(`Options for ${select.id}:`, {
                    display: optionsEl?.style.display,
                    computedDisplay: window.getComputedStyle(optionsEl).display,
                    isVisible: optionsEl?.offsetParent !== null
                });
            }
        });
        
        console.log(`Added click listener to dropdown: ${select.id}`);
        
        // Handle option selection
        const optionElements = options.querySelectorAll('.select-option');
        console.log(`Found ${optionElements.length} options for dropdown ${select.id}:`, Array.from(optionElements).map(o => ({ text: o.textContent.trim(), value: o.dataset.value })));
        
        optionElements.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Option clicked:', option.textContent.trim(), 'Value:', option.dataset.value, 'Select ID:', select.id);
                
                const value = option.dataset.value;
                const text = option.textContent;
                
                // Update trigger text if there's a label
                const label = trigger.querySelector('span');
                if (label) {
                    label.textContent = text;
                }
                
                // Close dropdown
                select.classList.remove('active');
                
                // Handle specific dropdown actions
                if (select.id === 'teamSortBySelect') {
                    console.log('Team sort changed to:', value);
                    appState.teamSort = value;
                    updateTeamSortByLabel();
                    applyFiltersAndRender();
                }
            });
        });
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select')) {
            customSelects.forEach(select => {
                select.classList.remove('active');
            });
        }
    });
    
    console.log('Custom dropdowns setup complete');
}

function updateTeamSortByLabel() {
    const label = document.getElementById('teamSortByLabel');
    if (label) {
        switch (appState.teamSort) {
            case 'value':
                label.textContent = 'Total Value';
                break;
            case 'starter-value':
                label.textContent = 'Starter Value';
                break;
            case 'weekly-points':
                label.textContent = 'Weekly Points';
                break;
            case 'name':
                label.textContent = 'Team Name';
                break;
            default:
                label.textContent = 'Total Value';
        }
    }
}

function toggleTeamSelector() {
    console.log('Team selector toggle called');
    const options = document.getElementById('teamSelectOptions');
    const trigger = document.getElementById('teamSelectTrigger');
    const select = document.getElementById('teamSelect');
    
    console.log('Team selector elements:', { options: !!options, trigger: !!trigger, select: !!select });
    
    if (!options || !trigger || !select) return;
    
    // Close other dropdowns first
    document.querySelectorAll('.custom-select').forEach(selectEl => {
        if (selectEl.id !== 'teamSelect') {
            selectEl.classList.remove('active');
        }
    });
    
    // Toggle team selector
    const isActive = select.classList.contains('active');
    if (isActive) {
        select.classList.remove('active');
        console.log('Team selector closed');
    } else {
        select.classList.add('active');
        console.log('Team selector opened');
    }
}

function closeTeamSelectorOnOutsideClick(event) {
    const teamSelect = document.getElementById('teamSelect');
    const options = document.getElementById('teamSelectOptions');
    
    if (!teamSelect || !options) return;
    
    if (!teamSelect.contains(event.target)) {
        teamSelect.classList.remove('active');
    }
}

function setupTeamSelectorEventListeners() {
    const teamOptions = document.getElementById('teamSelectOptions');
    if (!teamOptions) return;
    
    // Add event listeners for team selection
    teamOptions.querySelectorAll('.select-option').forEach(option => {
        const checkbox = option.querySelector('input[type="checkbox"]');
        const value = option.dataset.value;
        
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            console.log('Checkbox changed:', { value, checked: checkbox.checked });
            
            // Use the centralized team selection handler
            handleTeamSelection(value, checkbox.checked);
        });
    });
}

function handleRosterViewChange(view) {
    appState.rosterView = view;
    applyFiltersAndRender();
}

function handleValueNormalizationChange(value) {
    appState.valueNormalization = value;
    // Reprocess roster data to recalculate values with new normalization
    allData.processedRosters = processRosterData();
    applyFiltersAndRender();
}

function handleProjectionModeChange(value) {
    appState.projectionMode = value;
    applyFiltersAndRender();
    // Update both main and trade display option labels
    updateDisplayOptionLabels();
    updateTradeDisplayOptionLabels();
}

function updateDisplayOptionLabels() {
    // Update projection mode label
    const projectionModeLabel = document.getElementById('projectionModeLabel');
    if (projectionModeLabel) {
        switch (appState.projectionMode) {
            case 'week':
                const weekNumber = window.currentWeekNumber || 1;
                projectionModeLabel.textContent = `Week ${weekNumber} Projection`;
                break;
            case 'average':
                projectionModeLabel.textContent = 'Average';
                break;
            case 'season':
                projectionModeLabel.textContent = 'Season Total';
                break;
        }
    }
    
    // Update value display label
    const valueDisplayLabel = document.getElementById('valueDisplayLabel');
    if (valueDisplayLabel) {
        switch (appState.valueNormalization) {
            case 'raw':
                valueDisplayLabel.textContent = 'Raw Values';
                break;
            case 'normalized':
                valueDisplayLabel.textContent = 'Normalized (0-100)';
                break;
        }
    }
}

function updateProjectionModeDropdownOptions(weekNumber) {
    // Update the main projection mode dropdown option text to show the correct week number
    const weekOption = document.querySelector('#projectionModeOptions .select-option[data-value="week"]');
    if (weekOption) {
        weekOption.textContent = `Week ${weekNumber} Projection`;
    }
    
    // Update the trade calculator projection mode dropdown option text
    const tradeWeekOption = document.querySelector('#tradeProjectionModeOptions .select-option[data-value="week"]');
    if (tradeWeekOption) {
        tradeWeekOption.textContent = `Week ${weekNumber} Projection`;
    }
}

function handleKeyboardShortcuts(event) {
    // Horizontal view navigation
    if (appState.horizontalView) {
        const rostersGrid = document.getElementById('rostersGrid');
        if (!rostersGrid) return;
        
        switch (event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                rostersGrid.scrollBy({ left: -400, behavior: 'smooth' });
                break;
            case 'ArrowRight':
                event.preventDefault();
                rostersGrid.scrollBy({ left: 400, behavior: 'smooth' });
                break;
            case 'Home':
                event.preventDefault();
                rostersGrid.scrollTo({ left: 0, behavior: 'smooth' });
                break;
            case 'End':
                event.preventDefault();
                rostersGrid.scrollTo({ left: rostersGrid.scrollWidth, behavior: 'smooth' });
                break;
        }
    }
}

function updateScrollPositionIndicator() {
    if (!appState.horizontalView) return;
    
    const rostersGrid = document.getElementById('rostersGrid');
    if (!rostersGrid) return;
    
    const scrollPercent = (rostersGrid.scrollLeft / (rostersGrid.scrollWidth - rostersGrid.clientWidth)) * 100;
    
    // Update scroll indicator if it exists
    const indicator = document.querySelector('.scroll-indicator');
    if (indicator) {
        indicator.style.left = `${scrollPercent}%`;
    }
}

function updateTeamCountIndicator() {
    if (!appState.horizontalView) return;
    
    const rostersContainer = document.getElementById('rostersContainer');
    if (!rostersContainer) return;
    
    const teamCount = allData.processedRosters.length;
    rostersContainer.setAttribute('data-team-count', `${teamCount} Teams - Use arrow keys or scroll to navigate`);
}


async function loadAllData() {
    showLoading();
    try {
        const sleeperData = await fetchSleeperData();
        const { valueMap, espnIdMap } = await fetchFantasyCalcValues();
        const projectionData = await fetchProjectionData();
        allData = { ...allData, ...sleeperData, playerValues: valueMap, espnIdMap, projectionData };
        allData.processedRosters = processRosterData();
        
        hideLoading();
        updateLeagueInfo();
        
        // Initialize team selector after data is loaded
        populateTeamSelector();
        
        // Small delay to ensure DOM is fully ready
        setTimeout(() => {
            setupCustomDropdowns(); // Setup dropdowns after data is loaded
            updateDisplayOptionLabels(); // Update display option labels
            
            // Ensure team selector state is properly synchronized
            synchronizeCheckboxStates();
            updateTeamSelectorLabel();
        }, 100);
        
        applyFiltersAndRender();
        showRosters();
        
        if (document.getElementById('showTradeCalculatorBtn').classList.contains('active')) {
            initTradeCalculator();
        }
    } catch (error) {
        console.error('Error loading data:', error);
        showError(error.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Note: I've stubbed out some functions that were in your original file but not in the
    // provided snippets. You will need to ensure the full, original versions of these
    // functions are present for full functionality.
    // For this provided code to work, the full original script must be the base.
    // The code I've provided here IS that full base.
    
    initializeTheme();
    initializeHorizontalView();
    setupEventListeners();
    setupLoginEventListeners();
    updateTeamSortByLabel();
    
    // Check if user is already authenticated
    if (checkSavedAuth()) {
        // User is authenticated, show main app
        hideLoginModal();
        // Initialize team selector state before loading data
        initializeTeamSelectorState();
        loadAllData();
    } else {
        // User not authenticated, show login modal
        showLoginModal();
    }
});

window.debug = { allData, CONFIG, loadAllData, tradeState };

function initializeTeamSelectorState() {
    // Ensure the initial state is properly set up
    console.log('Initializing team selector state');
    
    // Make sure "All Teams" is selected by default
    if (appState.selectedTeams.size === 0 || !appState.selectedTeams.has('all')) {
        appState.selectedTeams.clear();
        appState.selectedTeams.add('all');
        console.log('Set initial state to "All Teams"');
    }
    
    // Ensure the HTML checkbox state matches the JavaScript state
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = appState.selectedTeams.has('all');
        console.log('Synchronized select all checkbox:', selectAllCheckbox.checked);
    }
    
    // Update the label to reflect the current state
    updateTeamSelectorLabel();
}

function calculatePositionChanges(preTradeLineup, postTradeLineup) {
    const changes = {
        promoted: [], // Players moving from bench/flex to starter positions
        demoted: [],  // Players moving from starter positions to flex/bench
        flexToStarter: [], // Players moving from flex to true QB/RB/WR/TE positions
        starterToFlex: []  // Players moving from true positions to flex
    };
    
    // Create maps of player positions for easy lookup
    const preTradePositions = {};
    const postTradePositions = {};
    
    // Build pre-trade position map
    Object.entries(preTradeLineup).forEach(([position, players]) => {
        players.forEach(player => {
            preTradePositions[player.id] = position;
        });
    });
    
    // Build post-trade position map
    Object.entries(postTradeLineup).forEach(([position, players]) => {
        players.forEach(player => {
            postTradePositions[player.id] = position;
        });
    });
    
    // Check for position changes
    Object.keys(preTradePositions).forEach(playerId => {
        const prePosition = preTradePositions[playerId];
        const postPosition = postTradePositions[playerId];
        
        if (prePosition !== postPosition) {
            const player = findPlayerById(playerId);
            if (!player) return;
            
            const change = {
                player: player,
                fromPosition: prePosition,
                toPosition: postPosition
            };
            
            // Determine the type of change
            if (isStarterPosition(postPosition) && !isStarterPosition(prePosition)) {
                // Moving to a starter position (QB, RB, WR, TE)
                if (isFlexPosition(prePosition)) {
                    // From flex to starter
                    changes.flexToStarter.push(change);
                } else {
                    // From bench to starter
                    changes.promoted.push(change);
                }
            } else if (isStarterPosition(prePosition) && !isStarterPosition(postPosition)) {
                // Moving from starter to flex/bench
                if (isFlexPosition(postPosition)) {
                    // From starter to flex
                    changes.starterToFlex.push(change);
                } else {
                    // From starter to bench
                    changes.demoted.push(change);
                }
            } else if (isFlexPosition(postPosition) && !isFlexPosition(prePosition)) {
                // Moving to flex from bench
                changes.promoted.push(change);
            } else if (isFlexPosition(prePosition) && !isFlexPosition(postPosition)) {
                // Moving from flex to bench
                changes.demoted.push(change);
            }
        }
    });
    
    return changes;
}

function isStarterPosition(position) {
    return ['QB', 'RB', 'WR', 'TE'].includes(position);
}

function isFlexPosition(position) {
    return ['SFLEX', 'FLEX'].includes(position);
}

function findPlayerById(playerId) {
    // Search through all rosters to find the player
    for (const roster of allData.processedRosters) {
        const player = roster.players.find(p => p.id === playerId);
        if (player) return player;
    }
    return null;
}

// ==================================================================
// == SECTION 2: USER AUTHENTICATION & LOGIN SYSTEM
// ==================================================================

async function fetchUserLeagues(username) {
    try {
        const response = await fetch(`https://api.sleeper.app/v1/user/${username}`);
        if (!response.ok) {
            throw new Error('User not found');
        }
        
        const userData = await response.json();
        
        // Get current NFL season dynamically
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1; // January = 1
        
        // If we're in the first half of the year (before August), use previous year's season
        // If we're in the second half (August onwards), use current year's season
        const currentSeason = currentMonth < 8 ? currentYear - 1 : currentYear;
        
        // Fetch both current season and previous season to give users options
        const seasonsToFetch = [currentSeason, currentSeason - 1];
        let allLeagues = [];
        
        for (const season of seasonsToFetch) {
            try {
                const leaguesResponse = await fetch(`https://api.sleeper.app/v1/user/${userData.user_id}/leagues/nfl/${season}`);
                if (leaguesResponse.ok) {
                    const seasonLeagues = await leaguesResponse.json();
                    // Add season info to each league
                    seasonLeagues.forEach(league => {
                        league.season = season;
                        league.isCurrentSeason = season === currentSeason;
                    });
                    allLeagues = allLeagues.concat(seasonLeagues);
                }
            } catch (error) {
                console.warn(`Failed to fetch leagues for season ${season}:`, error);
            }
        }
        
        // Sort leagues: current season first, then by league name
        allLeagues.sort((a, b) => {
            if (a.isCurrentSeason && !b.isCurrentSeason) return -1;
            if (!a.isCurrentSeason && b.isCurrentSeason) return 1;
            return a.name.localeCompare(b.name);
        });
        
        return { userData, leagues: allLeagues };
    } catch (error) {
        console.error('Error fetching user leagues:', error);
        throw error;
    }
}

function showLoginModal() {
    const loginModal = document.getElementById('loginModal');
    const mainApp = document.getElementById('mainApp');
    
    if (loginModal && mainApp) {
        loginModal.style.display = 'flex';
        mainApp.style.display = 'none';
    }
}

function hideLoginModal() {
    const loginModal = document.getElementById('loginModal');
    const mainApp = document.getElementById('mainApp');
    
    if (loginModal && mainApp) {
        loginModal.style.display = 'none';
        mainApp.style.display = 'flex';
    }
}

function showUsernameStep() {
    document.getElementById('usernameStep').style.display = 'block';
    document.getElementById('leagueStep').style.display = 'none';
    document.getElementById('usernameInput').value = '';
}

function showLeagueStep() {
    document.getElementById('usernameStep').style.display = 'none';
    document.getElementById('leagueStep').style.display = 'block';
}

function populateLeagueSelector(leagues) {
    const leagueButtons = document.getElementById('leagueButtons');
    
    // Clear existing options
    leagueButtons.innerHTML = '';
    
    if (leagues.length === 0) {
        leagueButtons.innerHTML = '<div class="league-button" style="text-align: center; cursor: default;">No leagues found</div>';
        return;
    }
    
    leagues.forEach(league => {
        const button = document.createElement('button');
        button.className = 'league-button';
        button.type = 'button';
        
        button.innerHTML = `
            <div class="league-name">${league.name}</div>
            <div class="league-details">
                ${league.isCurrentSeason ? '🟢 Current Season' : '⚫ Previous Season'} • Season ${league.season} • ${league.total_rosters} teams
            </div>
        `;
        
        button.addEventListener('click', () => {
            // Remove selected class from all buttons
            document.querySelectorAll('.league-button').forEach(btn => {
                btn.classList.remove('selected');
            });
            
            // Add selected class to clicked button
            button.classList.add('selected');
            
            // Set the selected league
            userAuth.leagueId = league.league_id;
            
            // Automatically enter the league after a short delay
            setTimeout(() => {
                enterSelectedLeague();
            }, 300);
        });
        
        leagueButtons.appendChild(button);
    });
}

function setupLoginEventListeners() {
    const findLeaguesBtn = document.getElementById('findLeaguesBtn');
    const backToUsernameBtn = document.getElementById('backToUsernameBtn');
    const usernameInput = document.getElementById('usernameInput');
    
    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            // Clear saved authentication
            localStorage.removeItem('ffapp-user-auth');
            userAuth = {
                isAuthenticated: false,
                username: null,
                userId: null,
                leagueId: null,
                userLeagues: []
            };
            
            // Reset CONFIG
            CONFIG.sleeper.username = null;
            CONFIG.sleeper.leagueId = null;
            CONFIG.sleeper.userId = null;
            
            // Show login modal
            showLoginModal();
        });
    }
    
    // Find leagues button
    findLeaguesBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        if (!username) {
            alert('Please enter a username');
            return;
        }
        
        const loading = document.getElementById('usernameLoading');
        loading.style.display = 'block';
        findLeaguesBtn.disabled = true;
        
        try {
            const { userData, leagues } = await fetchUserLeagues(username);
            
            userAuth.username = username;
            userAuth.userId = userData.user_id;
            userAuth.userLeagues = leagues;
            
            populateLeagueSelector(leagues);
            showLeagueStep();
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            loading.style.display = 'none';
            findLeaguesBtn.disabled = false;
        }
    });
    
    // Back to username button
    backToUsernameBtn.addEventListener('click', () => {
        showUsernameStep();
        userAuth.leagueId = null;
        // Clear any selected league buttons
        document.querySelectorAll('.league-button').forEach(btn => {
            btn.classList.remove('selected');
        });
    });
    
    // Enter key on username input
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            findLeaguesBtn.click();
        }
    });
}

function checkSavedAuth() {
    const savedAuth = localStorage.getItem('ffapp-user-auth');
    if (savedAuth) {
        try {
            const auth = JSON.parse(savedAuth);
            if (auth.username && auth.leagueId && auth.userId) {
                userAuth = { ...userAuth, ...auth, isAuthenticated: true };
                CONFIG.sleeper.username = auth.username;
                CONFIG.sleeper.leagueId = auth.leagueId;
                CONFIG.sleeper.userId = auth.userId;
                return true;
            }
        } catch (error) {
            console.error('Error parsing saved auth:', error);
            localStorage.removeItem('ffapp-user-auth');
        }
    }
    return false;
}

// ==================================================================
// == SECTION 3: MODIFIED APPLICATION LOGIC FOR USER TEAM PRIORITY
// ==================================================================

function enterSelectedLeague() {
    if (!userAuth.leagueId) {
        alert('Please select a league');
        return;
    }
    
    // Update CONFIG with selected league
    CONFIG.sleeper.username = userAuth.username;
    CONFIG.sleeper.leagueId = userAuth.leagueId;
    CONFIG.sleeper.userId = userAuth.userId;
    
    userAuth.isAuthenticated = true;
    
    // Store in localStorage
    localStorage.setItem('ffapp-user-auth', JSON.stringify(userAuth));
    
    hideLoginModal();
    
    // Load the selected league
    loadAllData();
}