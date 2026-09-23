$body = @{
  state = @{
    scene = "dungeon tier 1, Greenhills Catacombs"
    player = @{ class="mage"; level=2; hp=6; maxHp=24; mp=12; maxMp=15; atk=2; def=1; potions=1;
      skills=@(@{name="Firebolt"; cost=3; ready=$true; desc="Ranged bolt: 4 + INT damage."}) }
    monsters=@(@{name="Giant Rat"; hp=6; maxHp=6; dist=1; boss=$false}, @{name="Goblin"; hp=12; maxHp=12; dist=4; boss=$false})
    items=@(@{name="Health potion"; dist=6})
    stairs=@(@{dist=11})
    exits=@()
    quests=@(@{name="Wolf pelts"; progress=1; need=3; done=$false})
  }
} | ConvertTo-Json -Depth 6
Invoke-RestMethod "http://127.0.0.1:8732/decide" -Method Post -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 6
