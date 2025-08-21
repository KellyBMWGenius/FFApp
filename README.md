# Fantasy Football Roster Analyzer

A modern web application for analyzing fantasy football rosters with integrated data from Sleeper and FantasyCalc.

## 🏈 Features

- **Real-time Data**: Fetches live roster data from Sleeper API
- **Player Values**: Integrates FantasyCalc values for accurate player assessments
- **Smart Positioning**: Automatically optimizes lineup based on player values
- **Multiple View Modes**: Switch between optimal lineup view and positional comparison
- **Team Selection**: Choose specific teams to compare side-by-side
- **Advanced Filtering**: Filter by starters, bench, or search for specific players
- **Flexible Sorting**: Sort teams by total value, starter value, or team name
- **Responsive Design**: Works perfectly on desktop and mobile devices

## 🚀 Live Demo

Visit the live application: [Fantasy Roster Analyzer](https://your-username.github.io/fantasy-roster-analyzer)

## 📊 Roster Structure

The app uses a SuperFlex league format:
- **Starters (10 positions):**
  - 1x QB
  - 2x RB  
  - 3x WR
  - 1x TE
  - 1x SFLEX (QB/RB/WR/TE)
  - 2x FLEX (RB/WR/TE)
- **Bench:** All remaining eligible players

*Note: Kickers, Defenses, and Defensive Players are excluded from analysis*

## 👁️ View Modes

### Default (Optimal Lineup)
- Shows the best possible starting lineup based on FantasyCalc values
- Automatically fills each position with the highest-value eligible player
- Remaining players sorted by value on the bench
- Perfect for seeing each team's maximum potential

### Positional Comparison  
- Groups all players by their actual position (QB, RB, WR, TE)
- Sorts players within each position by FantasyCalc value
- Dynamic section sizes that align across teams for easy comparison
- Ideal for comparing positional depth between teams

## 🛠️ Configuration

To use with your own league, update the configuration in `script.js`:

```javascript
const CONFIG = {
    sleeper: {
        username: 'your-sleeper-username',
        leagueId: 'your-league-id'
    },
    // ... other settings
};
```

## 🔧 Technical Details

### APIs Used
- **Sleeper API**: For league data, rosters, and player information
- **FantasyCalc API**: For current player values and rankings

### Technology Stack
- Vanilla JavaScript (ES6+)
- CSS3 with Flexbox/Grid
- HTML5
- Font Awesome icons
- Google Fonts (Inter)

### Key Features
- **CORS-enabled**: All API calls work directly from the browser
- **Real-time Updates**: Refresh button fetches latest data
- **Responsive Design**: Mobile-first approach
- **Performance Optimized**: Efficient data processing and rendering
- **Error Handling**: Graceful error messages and retry options

## 📱 Screenshots

### Desktop View
![Desktop Screenshot](screenshots/desktop.png)

### Mobile View
![Mobile Screenshot](screenshots/mobile.png)

## 🚀 Getting Started

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/your-username/fantasy-roster-analyzer.git
cd fantasy-roster-analyzer
```

2. Update the configuration in `script.js` with your Sleeper details

3. Serve the files using a local server:
```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

4. Open `http://localhost:8000` in your browser

### GitHub Pages Deployment

1. Push your code to a GitHub repository
2. Go to repository Settings → Pages
3. Select "Deploy from a branch"
4. Choose "main" branch and "/ (root)" folder
5. Your app will be available at `https://your-username.github.io/repository-name`

## 🔄 Data Flow

1. **League Data**: Fetches league info, rosters, and users from Sleeper
2. **Player Database**: Downloads complete NFL player database from Sleeper
3. **Value Integration**: Matches players with FantasyCalc values using Sleeper IDs
4. **Roster Optimization**: Arranges players in optimal starting lineup by value
5. **UI Rendering**: Creates responsive roster cards with filtering/sorting

## 🎯 Future Enhancements

- [ ] Trade calculator functionality
- [ ] Weekly points projections
- [ ] Player trend analysis
- [ ] League standings integration
- [ ] Export/sharing capabilities
- [ ] Multiple league support
- [ ] Save/bookmark team comparisons
- [ ] Player news integration
- [ ] Historical value tracking
- [ ] Position-specific value metrics (targets, touches, etc.)
- [ ] Dark/light theme toggle

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Sleeper](https://sleeper.app) for providing comprehensive fantasy football APIs
- [FantasyCalc](https://www.fantasycalc.com) for player value data
- [Font Awesome](https://fontawesome.com) for icons
- [Google Fonts](https://fonts.google.com) for typography

## ⚠️ Disclaimer

This application is for educational and personal use only. Player values and projections should not be the sole basis for fantasy football decisions. Always do your own research!

---

**Made with ❤️ for fantasy football enthusiasts**
