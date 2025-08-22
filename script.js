// Fantasy Football Roster Analyzer with Teamify Visual Styling
document.addEventListener('DOMContentLoaded', function() {
    // Initialize the app
    initializeApp();
});

function initializeApp() {
    // Add event listeners
    addEventListeners();
    
    // Load initial data
    loadLeagueData();
}

function addEventListeners() {
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadLeagueData);
    }
    
    // Team selector
    const teamSelectTrigger = document.getElementById('teamSelectTrigger');
    if (teamSelectTrigger) {
        teamSelectTrigger.addEventListener('click', toggleTeamSelect);
    }
    
    // Filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filterRosters();
        });
    });
    
    // Projection mode
    const projectionMode = document.getElementById('projectionMode');
    if (projectionMode) {
        projectionMode.addEventListener('change', updateProjections);
    }
    
    // Sort controls
    const sortBy = document.getElementById('sortBy');
    if (sortBy) {
        sortBy.addEventListener('change', updateViewMode);
    }
    
    // Team sort controls
    const teamSortBy = document.getElementById('teamSortBy');
    if (teamSortBy) {
        teamSortBy.addEventListener('change', sortTeams);
    }
    
    // Value normalization
    const valueNormalization = document.getElementById('valueNormalization');
    if (valueNormalization) {
        valueNormalization.addEventListener('change', updateValueDisplay);
    }
    
    // Close team selector when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.custom-select')) {
            const teamSelectOptions = document.getElementById('teamSelectOptions');
            if (teamSelectOptions) {
                teamSelectOptions.style.display = 'none';
            }
        }
    });
}

function toggleTheme() {
    const body = document.body;
    const currentTheme = body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    body.setAttribute('data-theme', newTheme);
    
    // Update theme toggle icon
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = newTheme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }
    
    // Save theme preference
    localStorage.setItem('theme', newTheme);
}

function toggleTeamSelect() {
    const teamSelectOptions = document.getElementById('teamSelectOptions');
    if (teamSelectOptions) {
        const isVisible = teamSelectOptions.style.display === 'block';
        teamSelectOptions.style.display = isVisible ? 'none' : 'block';
    }
}

function loadLeagueData() {
    showLoading(true);
    hideError();
    
    // Simulate loading data (replace with actual API call)
    setTimeout(() => {
        try {
            // Mock data for demonstration
            const mockData = {
                leagueName: 'Fantasy Football League 2024',
                teams: [
                    {
                        name: 'Team Alpha',
                        owner: 'John Doe',
                        players: generateMockPlayers()
                    },
                    {
                        name: 'Team Beta',
                        owner: 'Jane Smith',
                        players: generateMockPlayers()
                    }
                ]
            };
            
            displayLeagueData(mockData);
            showLoading(false);
        } catch (error) {
            showError('Failed to load league data: ' + error.message);
            showLoading(false);
        }
    }, 1500);
}

function generateMockPlayers() {
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const players = [];
    
    positions.forEach(pos => {
        const count = pos === 'RB' || pos === 'WR' ? 4 : 2;
        for (let i = 0; i < count; i++) {
            players.push({
                name: `Player ${pos}${i + 1}`,
                position: pos,
                team: 'FA',
                projection: Math.floor(Math.random() * 20) + 10,
                value: Math.floor(Math.random() * 100) + 50
            });
        }
    });
    
    return players;
}

function displayLeagueData(data) {
    // Update league name
    const leagueName = document.getElementById('leagueName');
    if (leagueName) {
        leagueName.textContent = data.leagueName;
    }
    
    // Display rosters
    displayRosters(data.teams);
    
    // Show rosters container
    const rostersContainer = document.getElementById('rostersContainer');
    if (rostersContainer) {
        rostersContainer.style.display = 'block';
    }
}

function displayRosters(teams) {
    const rostersGrid = document.getElementById('rostersGrid');
    if (!rostersGrid) return;
    
    rostersGrid.innerHTML = '';
    
    teams.forEach(team => {
        const rosterCard = createRosterCard(team);
        rostersGrid.appendChild(rosterCard);
    });
}

function createRosterCard(team) {
    const card = document.createElement('div');
    card.className = 'roster-card';
    card.setAttribute('data-team', team.name);
    
    const header = document.createElement('div');
    header.className = 'roster-header';
    
    const title = document.createElement('h3');
    title.textContent = team.name;
    
    const stats = document.createElement('div');
    stats.className = 'roster-stats';
    
    // Calculate team stats
    const totalValue = team.players.reduce((sum, player) => sum + player.value, 0);
    const starterValue = team.players.slice(0, 9).reduce((sum, player) => sum + player.value, 0);
    const avgProjection = (team.players.reduce((sum, player) => sum + player.projection, 0) / team.players.length).toFixed(1);
    
    stats.innerHTML = `
        <div class="stat">
            <div class="stat-value">${totalValue}</div>
            <div>Total Value</div>
        </div>
        <div class="stat">
            <div class="stat-value">${starterValue}</div>
            <div>Starter Value</div>
        </div>
        <div class="stat">
            <div class="stat-value">${avgProjection}</div>
            <div>Avg Projection</div>
        </div>
    `;
    
    header.appendChild(title);
    header.appendChild(stats);
    
    const body = document.createElement('div');
    body.className = 'roster-body';
    
    // Group players by position
    const playersByPosition = groupPlayersByPosition(team.players);
    
    Object.keys(playersByPosition).forEach(position => {
        const positionSection = createPositionSection(position, playersByPosition[position]);
        body.appendChild(positionSection);
    });
    
    card.appendChild(header);
    card.appendChild(body);
    
    return card;
}

function groupPlayersByPosition(players) {
    const grouped = {};
    players.forEach(player => {
        if (!grouped[player.position]) {
            grouped[player.position] = [];
        }
        grouped[player.position].push(player);
    });
    return grouped;
}

function createPositionSection(position, players) {
    const section = document.createElement('div');
    section.className = 'position-section';
    
    const header = document.createElement('h4');
    header.className = 'position-header';
    header.innerHTML = `${position} <span class="position-count">${players.length}</span>`;
    
    const columnHeaders = document.createElement('div');
    columnHeaders.className = 'column-headers';
    columnHeaders.innerHTML = `
        <div class="header-player">Player</div>
        <div class="header-position">Pos</div>
        <div class="header-projection">Proj</div>
        <div class="header-value">Value</div>
    `;
    
    section.appendChild(header);
    section.appendChild(columnHeaders);
    
    players.forEach(player => {
        const playerRow = createPlayerRow(player);
        section.appendChild(playerRow);
    });
    
    return section;
}

function createPlayerRow(player) {
    const row = document.createElement('div');
    row.className = 'player-row';
    
    const projectionClass = getProjectionClass(player.projection);
    const valueClass = getValueClass(player.value);
    
    row.innerHTML = `
        <div class="player-info">
            <div class="player-name">${player.name}</div>
            <div class="player-details">${player.team}</div>
        </div>
        <div class="position-badge">${player.position}</div>
        <div class="player-projection ${projectionClass}">${player.projection}</div>
        <div class="player-value ${valueClass}">${player.value}</div>
    `;
    
    return row;
}

function getProjectionClass(projection) {
    if (projection >= 18) return 'very-high';
    if (projection >= 15) return 'high';
    if (projection >= 12) return 'medium';
    return 'low';
}

function getValueClass(value) {
    if (value >= 90) return 'very-high';
    if (value >= 80) return 'high';
    if (value >= 70) return 'medium';
    return 'low';
}

function filterRosters() {
    const activeFilter = document.querySelector('.filter-btn.active').getAttribute('data-filter');
    const rosterCards = document.querySelectorAll('.roster-card');
    
    rosterCards.forEach(card => {
        const positionSections = card.querySelectorAll('.position-section');
        positionSections.forEach(section => {
            if (activeFilter === 'starters') {
                // Show only first few players per position (starters)
                const playerRows = section.querySelectorAll('.player-row');
                playerRows.forEach((row, index) => {
                    row.style.display = index < 2 ? 'grid' : 'none';
                });
            } else if (activeFilter === 'bench') {
                // Show only bench players
                const playerRows = section.querySelectorAll('.player-row');
                playerRows.forEach((row, index) => {
                    row.style.display = index >= 2 ? 'grid' : 'none';
                });
            } else {
                // Show all players
                const playerRows = section.querySelectorAll('.player-row');
                playerRows.forEach(row => {
                    row.style.display = 'grid';
                });
            }
        });
    });
}

function updateProjections() {
    const projectionMode = document.getElementById('projectionMode');
    if (!projectionMode) return;
    
    const mode = projectionMode.value;
    console.log('Projection mode changed to:', mode);
    
    // Update projections based on mode
    // This would typically involve recalculating projections
}

function updateViewMode() {
    const sortBy = document.getElementById('sortBy');
    if (!sortBy) return;
    
    const mode = sortBy.value;
    console.log('View mode changed to:', mode);
    
    // Update view mode
    // This would typically involve reorganizing the display
}

function sortTeams() {
    const teamSortBy = document.getElementById('teamSortBy');
    if (!teamSortBy) return;
    
    const sortBy = teamSortBy.value;
    console.log('Team sort changed to:', sortBy);
    
    // Sort teams based on criteria
    // This would typically involve reordering the roster cards
}

function updateValueDisplay() {
    const valueNormalization = document.getElementById('valueNormalization');
    if (!valueNormalization) return;
    
    const display = valueNormalization.value;
    console.log('Value display changed to:', display);
    
    // Update value display
    // This would typically involve recalculating and reformatting values
}

function showLoading(show) {
    const loadingSpinner = document.getElementById('loadingSpinner');
    if (loadingSpinner) {
        loadingSpinner.style.display = show ? 'flex' : 'none';
    }
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    
    if (errorMessage && errorText) {
        errorText.textContent = message;
        errorMessage.style.display = 'flex';
    }
}

function hideError() {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }
}

// Load saved theme preference
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.setAttribute('data-theme', savedTheme);
        
        // Update theme toggle icon
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const icon = themeToggle.querySelector('i');
            if (icon) {
                icon.className = savedTheme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
            }
        }
    }
}

// Initialize saved theme
loadSavedTheme();
