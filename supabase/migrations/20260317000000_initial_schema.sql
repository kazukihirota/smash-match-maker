-- Characters table
CREATE TABLE characters (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  fighter_number text NOT NULL,
  image_slug text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Characters are viewable by everyone" ON characters FOR SELECT USING (true);

-- Rooms table
CREATE TABLE rooms (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_code integer UNIQUE NOT NULL,
  creator_token uuid NOT NULL,
  players text[] DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms_select" ON rooms FOR SELECT USING (true);
CREATE POLICY "rooms_insert" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "rooms_update" ON rooms FOR UPDATE USING (true);

-- Matches table
CREATE TABLE matches (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_code integer REFERENCES rooms(room_code),
  round integer NOT NULL,
  player1 text NOT NULL,
  player2 text NOT NULL,
  completed boolean DEFAULT false,
  winner text,
  position integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  player1_character_id bigint REFERENCES characters(id),
  player2_character_id bigint REFERENCES characters(id)
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON matches FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON matches FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON matches FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON matches FOR DELETE USING (true);

-- Player defaults table
CREATE TABLE player_defaults (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_name text UNIQUE NOT NULL,
  default_character_id bigint REFERENCES characters(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE player_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Player defaults are viewable by everyone" ON player_defaults FOR SELECT USING (true);
CREATE POLICY "Player defaults can be inserted by anyone" ON player_defaults FOR INSERT WITH CHECK (true);
CREATE POLICY "Player defaults can be updated by anyone" ON player_defaults FOR UPDATE USING (true);
CREATE POLICY "Player defaults can be deleted by anyone" ON player_defaults FOR DELETE USING (true);

-- Player scores table
CREATE TABLE player_scores (
  player_name text PRIMARY KEY,
  elo_rating integer DEFAULT 1000,
  wins integer DEFAULT 0,
  losses integer DEFAULT 0
);

ALTER TABLE player_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON player_scores FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON player_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON player_scores FOR UPDATE USING (true);

-- Enable realtime for rooms and matches
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
