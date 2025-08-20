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
    processedRosters: []
};

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatValue = (value) => {
    if (!value || value === 0) return '0';
    return value.toLocaleString();
};

const getValueClass = (value) => {
    if (value >= 5000) return 'high';
    if (value >= 1000) return 'medium';
    return 'low';
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
        
        // Convert to a map by sleeper ID for easy lookup
        const valueMap = {};
        data.forEach(player => {
            if (player.player.sleeperId) {
                valueMap[player.player.sleeperId] = player.value;
            }
        });
        
        return valueMap;
    } catch (error) {
        console.error('Error fetching FantasyCalc values:', error);
        throw new Error('Failed to fetch player values from FantasyCalc');
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

function renderRosters(rosters = allData.processedRosters) {
    const container = document.getElementById('rostersGrid');
    container.innerHTML = '';
    
    rosters.forEach((roster, index) => {
        const card = createRosterCard(roster);
        card.style.animationDelay = `${index * 0.1}s`;
        container.appendChild(card);
    });
}

function createRosterCard(roster) {
    const card = document.createElement('div');
    card.className = 'roster-card';
    
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
            ${createPositionSections(roster.organized)}
        </div>
    `;
    
    return card;
}

function createPositionSections(organized) {
    let html = '';
    
    // Starters
    html += '<div class="position-section">';
    html += '<div class="position-header">STARTERS <span class="position-count">10</span></div>';
    
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
                    <div class="team-badge">-</div>
                    <div class="player-value">0</div>
                </div>`;
            }
        }
        html += '</div>';
    });
    
    html += '</div>';
    
    // Bench
    if (organized.bench.length > 0) {
        html += '<div class="position-section">';
        html += `<div class="position-header">BENCH <span class="position-count">${organized.bench.length}</span></div>`;
        
        organized.bench.forEach(player => {
            html += createPlayerRow(player);
        });
        
        html += '</div>';
    }
    
    return html;
}

function createPlayerRow(player) {
    return `
        <div class="player-row">
            <div class="player-info">
                <div class="player-name">${player.name}</div>
                <div class="player-details">${player.position} • ${player.team}</div>
            </div>
            <div class="position-badge">${player.position}</div>
            <div class="team-badge">${player.team}</div>
            <div class="player-value ${getValueClass(player.value)}">${formatValue(player.value)}</div>
        </div>
    `;
}

// Event handlers
function setupEventListeners() {
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', loadAllData);
    
    // Search functionality
    document.getElementById('searchPlayers').addEventListener('input', handleSearch);
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', handleFilter);
    });
    
    // Sort dropdown
    document.getElementById('sortBy').addEventListener('change', handleSort);
}

function handleSearch(event) {
    const query = event.target.value.toLowerCase();
    const filteredRosters = allData.processedRosters.map(roster => {
        const filteredPlayers = roster.players.filter(player =>
            player.name.toLowerCase().includes(query) ||
            player.position.toLowerCase().includes(query) ||
            player.team.toLowerCase().includes(query)
        );
        
        if (filteredPlayers.length === 0 && query !== '') {
            return null;
        }
        
        return {
            ...roster,
            players: query === '' ? roster.players : filteredPlayers,
            organized: query === '' ? roster.organized : organizePlayersByPosition(filteredPlayers)
        };
    }).filter(roster => roster !== null);
    
    renderRosters(filteredRosters);
}

function handleFilter(event) {
    // Update active filter button
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    const filter = event.target.getAttribute('data-filter');
    let filteredRosters = [...allData.processedRosters];
    
    if (filter === 'starters') {
        filteredRosters = filteredRosters.map(roster => ({
            ...roster,
            players: roster.players.filter(p => p.isStarter),
            organized: organizePlayersByPosition(roster.players.filter(p => p.isStarter))
        }));
    } else if (filter === 'bench') {
        filteredRosters = filteredRosters.map(roster => ({
            ...roster,
            players: roster.players.filter(p => !p.isStarter),
            organized: { starters: {}, bench: roster.players.filter(p => !p.isStarter) }
        }));
    }
    
    renderRosters(filteredRosters);
}

function handleSort(event) {
    const sortBy = event.target.value;
    
    const sortedRosters = [...allData.processedRosters].sort((a, b) => {
        switch (sortBy) {
            case 'value':
                return b.stats.totalValue - a.stats.totalValue;
            case 'name':
                return a.teamName.localeCompare(b.teamName);
            default:
                return b.stats.totalValue - a.stats.totalValue;
        }
    });
    
    renderRosters(sortedRosters);
}

// Main initialization
async function loadAllData() {
    showLoading();
    
    try {
        // Fetch all data
        console.log('Fetching Sleeper data...');
        const sleeperData = await fetchSleeperData();
        
        console.log('Fetching FantasyCalc values...');
        const playerValues = await fetchFantasyCalcValues();
        
        // Store in global state
        allData = {
            ...allData,
            ...sleeperData,
            playerValues
        };
        
        console.log('Processing roster data...');
        allData.processedRosters = processRosterData();
        
        // Update UI
        updateLeagueInfo();
        renderRosters();
        showRosters();
        
        console.log('Data loaded successfully');
        
    } catch (error) {
        console.error('Error loading data:', error);
        showError(error.message);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadAllData();
});

// Export for debugging
window.debug = {
    allData,
    CONFIG,
    loadAllData,
    processRosterData
};
