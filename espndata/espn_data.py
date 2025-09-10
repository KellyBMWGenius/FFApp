import json
from espn_api.football import League
from datetime import datetime
import time

# Your league ID and year
LEAGUE_ID = 1947635809
YEAR = 2025

def get_current_nfl_week():
    """
    Dynamically determine the current NFL week.
    NFL weeks start on Tuesday, so we calculate based on that.
    """
    from datetime import datetime, timedelta
    
    # Get current date
    now = datetime.now()
    
    # NFL season typically starts in early September
    # For 2025 season, let's assume it starts September 2nd (first Tuesday of September)
    # You may need to adjust this date based on the actual NFL schedule
    season_start = datetime(2025, 9, 2)  # September 2, 2025 (first Tuesday)
    
    # Calculate days since season start
    days_since_start = (now - season_start).days
    
    # If we're before the season start, return week 1
    if days_since_start < 0:
        return 1
    
    # Calculate current week (each week is 7 days, starting on Tuesday)
    # Week 1: Sept 2-8, Week 2: Sept 9-15, etc.
    current_week = (days_since_start // 7) + 1
    
    # NFL regular season is typically 18 weeks
    # If we're past week 18, we're in playoffs or off-season
    if current_week > 18:
        return 18  # Return last regular season week
    
    return current_week

def parse_player_projections(player_stats, current_week):
    """
    Parse the raw player stats to extract the relevant projection data.
    Based on the sample_return.txt structure, we need to extract:
    - Week-specific projected points (from current week)
    - Season projected average points (from week 0)
    """
    if not player_stats:
        return None, None
    
    # Get current week projection - use integer key since that's what the dict has
    current_week_projection = None
    if current_week in player_stats:
        week_data = player_stats[current_week]
        if 'projected_points' in week_data:
            current_week_projection = week_data['projected_points']
    
    # If current week not available, try week 1 as fallback
    if current_week_projection is None and current_week != 1:
        if 1 in player_stats:
            week_data = player_stats[1]
            if 'projected_points' in week_data:
                current_week_projection = week_data['projected_points']
    
    # Get season projection (from week 0) - use integer key
    season_projection = None
    if 0 in player_stats:
        season_data = player_stats[0]
        if 'projected_avg_points' in season_data:
            season_projection = season_data['projected_avg_points']
    
    return current_week_projection, season_projection

def fetch_all_free_agents():
    """
    Fetch all available free agent players from the ESPN league.
    """
    try:
        print("Connecting to ESPN API...")
        # Use debug=True to ensure we get the same data structure that works
        league = League(league_id=LEAGUE_ID, year=YEAR, debug=True)
        
        print("Fetching all free agent players...")
        # Get all free agents - use a large size to get as many as possible
        # The ESPN API will return up to the maximum available
        players = league.free_agents(size=2000)
        
        if not players:
            print("No players found.")
            return []
        
        print(f"Total free agent players found: {len(players)}")
        return players
        
    except Exception as e:
        print(f"An error occurred while fetching free agents: {e}")
        return []

def process_players_and_save(players):
    """
    Process all players and save their projection data to JSON file.
    """
    current_week = get_current_nfl_week()
    print(f"Processing projections for week {current_week}...")
    
    processed_players = []
    
    for i, player in enumerate(players):
        if i % 100 == 0:
            print(f"Processing player {i+1}/{len(players)}...")
        
        # Parse the player's projection data
        week_projection, season_projection = parse_player_projections(player.stats, current_week)
        
        # Create the player data structure according to ideal format
        player_data = {
            "playerId": player.playerId,
            "playerName": player.name,
            "season_projection": {
                "projected_avg_points": season_projection
            },
            f"week_{current_week}_projection": {
                "projected_points": week_projection
            }
        }
        
        processed_players.append(player_data)
    
    # Save to JSON file
    output_filename = "player_data.json"
    print(f"Saving {len(processed_players)} players to {output_filename}...")
    
    try:
        with open(output_filename, 'w', encoding='utf-8') as f:
            json.dump(processed_players, f, indent=4, ensure_ascii=False)
        print(f"Successfully saved player data to {output_filename}")
        
        # Print some statistics
        players_with_week_proj = sum(1 for p in processed_players if p[f"week_{current_week}_projection"]["projected_points"] is not None)
        players_with_season_proj = sum(1 for p in processed_players if p["season_projection"]["projected_avg_points"] is not None)
        
        print(f"\nData Summary:")
        print(f"Total players processed: {len(processed_players)}")
        print(f"Players with week {current_week} projections: {players_with_week_proj}")
        print(f"Players with season projections: {players_with_season_proj}")
        
    except Exception as e:
        print(f"Error saving to file: {e}")

def main():
    """
    Main function to orchestrate the entire process.
    """
    print("=== ESPN Fantasy Football Data Fetcher ===")
    print(f"League ID: {LEAGUE_ID}")
    print(f"Year: {YEAR}")
    print("=" * 40)
    
    # Fetch all free agent players
    players = fetch_all_free_agents()
    
    if not players:
        print("No players found. Exiting.")
        return
    
    # Process players and save to JSON
    process_players_and_save(players)
    
    print("\n=== Process Complete ===")

if __name__ == "__main__":
    main()