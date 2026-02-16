// Generation data: brand → model → [{name, slug}]
// Slugs are otomoto.pl filter_enum_generation values
const GENERATIONS = {
  "Alfa Romeo": {
    "147": [
      { name: "147 (2000-2010)", slug: "gen-147-2000-2010" },
    ],
    "156": [
      { name: "156 (1997-2007)", slug: "gen-156-1997-2007" },
    ],
    "159": [
      { name: "159 (2005-2011)", slug: "gen-159-2005-2011" },
    ],
    "Giulia": [
      { name: "952 (2016-)", slug: "gen-952-2016" },
    ],
    "Stelvio": [
      { name: "949 (2017-)", slug: "gen-949-2017" },
    ],
  },

  "Audi": {
    "A3": [
      { name: "8L (1996-2003)", slug: "gen-8l-1996-2003" },
      { name: "8P (2003-2012)", slug: "gen-8p-2003-2012" },
      { name: "8V (2012-2020)", slug: "gen-8v-2012" },
      { name: "8Y (2020-)", slug: "gen-audi-a3-8y" },
    ],
    "A4": [
      { name: "B5 (1994-2001)", slug: "gen-b5-1994-2001" },
      { name: "B6 (2000-2004)", slug: "gen-b6-2000-2004" },
      { name: "B7 (2004-2008)", slug: "gen-b7-2004-2008" },
      { name: "B8 (2007-2015)", slug: "gen-b8-2007-2015" },
      { name: "B9 (2015-2023)", slug: "gen-b9-2015" },
    ],
    "A5": [
      { name: "I (2007-2016)", slug: "gen-i-2007-2016" },
      { name: "II (2016-)", slug: "gen-ii-2016" },
    ],
    "A6": [
      { name: "C5 (1997-2004)", slug: "gen-c5-1997-2004" },
      { name: "C6 (2004-2011)", slug: "gen-c6-2004-2011" },
      { name: "C7 (2011-2018)", slug: "gen-c7-2011" },
      { name: "C8 (2018-)", slug: "gen-c8-2018" },
    ],
    "A8": [
      { name: "D5 (2017-)", slug: "gen-d5-2017" },
      { name: "D4 (2010-)", slug: "gen-d4-2010" },
      { name: "D3 (2002-2010)", slug: "gen-d3-2002-2010" },
      { name: "D2 (1994-2002)", slug: "gen-d2-1994-2002" },
    ],
    "Q5": [
      { name: "FY (2017-2024)", slug: "gen-fy-2017" },
      { name: "8R (2008-2016)", slug: "gen-8r-2008-2016" },
      { name: "F5 (2024-)", slug: "gen-iii-2024" },
    ],
    "Q7": [
      { name: "II (2015-)", slug: "gen-ii-2015-q7" },
      { name: "I (2005-2015)", slug: "gen-i-2005-2015" },
    ],
  },

  "BMW": {
    "Seria 1": [
      { name: "F20/F21 (2011-2019)", slug: "gen-f20-2011" },
      { name: "E81/E87 (2004-2013)", slug: "gen-e87-2004-2013" },
      { name: "F40 (2019-)", slug: "gen-f40-2019" },
      { name: "F70 (2024-)", slug: "gen-f70-2024" },
      { name: "114", slug: "gen-v-114" },
    ],
    "Seria 2": [
      { name: "F22/F23 (2014-2021)", slug: "gen-f22-2013" },
      { name: "F44 Gran Coupe (2020-)", slug: "gen-f44-2019" },
      { name: "G42 (2021-)", slug: "gen-g42-2021" },
    ],
    "Seria 3": [
      { name: "G20/G21 (2019-)", slug: "gen-g20-2019" },
      { name: "F30/F31 (2012-2020)", slug: "gen-f30-2012" },
      { name: "E90/E91/E92/E93 (2005-2012)", slug: "gen-e90-2005-2012" },
      { name: "E46 (1998-2007)", slug: "gen-e46-1998-2007" },
      { name: "E36 (1990-1999)", slug: "gen-e36-1990-1999" },
      { name: "E30 (1982-1994)", slug: "gen-e30-1982-1994" },
      { name: "E21 (1975-1982)", slug: "gen-e21-1975-1982" },
    ],
    "Seria 4": [
      { name: "I F32/F33/F82 (2013-2020)", slug: "gen-i-f32" },
      { name: "II G22/G23/G82 (2020-)", slug: "gen-g22" },
    ],
    "Seria 5": [
      { name: "G30/G31 (2017-2023)", slug: "gen-g30-2017" },
      { name: "F10/F11 (2009-2017)", slug: "gen-f10-2009" },
      { name: "G60 (2023-)", slug: "gen-g60-2023" },
      { name: "E60/E61 (2003-2010)", slug: "gen-e60-2003-2010" },
      { name: "E39 (1996-2003)", slug: "gen-e39-1996-2003" },
      { name: "E34 (1988-1996)", slug: "gen-e34-1988-1996" },
      { name: "E28 (1981-1987)", slug: "gen-e28-1981-1987" },
      { name: "E12 (1972-1981)", slug: "gen-e12-1972-1981" },
    ],
    "Seria 7": [
      { name: "G11/12 (2015-2022)", slug: "gen-g11-12-2015" },
      { name: "G70 (2022-)", slug: "gen-g70-2022" },
      { name: "F01 (2008-2015)", slug: "gen-f01-2008-2015" },
      { name: "E65/66 (2001-2008)", slug: "gen-e65-66-2001-2008" },
      { name: "E38 (1994-2001)", slug: "gen-e38-1994-2001" },
      { name: "E32 (1986-1994)", slug: "gen-e32-1986-1994" },
    ],
    "X1": [
      { name: "F48 (2015-2022)", slug: "gen-f48-2015" },
      { name: "E84 (2009-2015)", slug: "gen-e84-2009-2015" },
      { name: "U11 (2022-)", slug: "gen-u11-2022" },
    ],
    "X3": [
      { name: "G01 (2017-)", slug: "gen-g01-2017" },
      { name: "G45 (2024-)", slug: "gen-g45-2024" },
      { name: "F25 (2010-2017)", slug: "gen-f25-2010" },
      { name: "E83 (2003-2010)", slug: "gen-e83-2003-2010" },
    ],
    "X5": [
      { name: "G05 (2018-)", slug: "gen-g05-2018" },
      { name: "F15 (2013-2018)", slug: "gen-f15-2013" },
      { name: "E70 (2006-2013)", slug: "gen-e70-2006-2013" },
      { name: "E53 (1999-2006)", slug: "gen-e53-1999-2006" },
    ],
    "X6": [
      { name: "G06 (2019-)", slug: "gen-g06-2019" },
      { name: "F16 (2014-)", slug: "gen-f16-2014" },
      { name: "E71 (2008-2014)", slug: "gen-e71-2008-2014" },
    ],
  },

  "Citroen": {
    "C3": [
      { name: "III (2016-2024)", slug: "gen-iii-2016" },
      { name: "II (2008-2018)", slug: "gen-ii-2008-c3" },
      { name: "I (2002-2009)", slug: "gen-i-2002-2009" },
      { name: "IV (2024-)", slug: "gen-iv-2024-c3" },
    ],
    "C4": [
      { name: "III (2020-)", slug: "gen-iii-2020" },
      { name: "II (2010-)", slug: "gen-ii-2010-c4" },
      { name: "I (2004-2010)", slug: "gen-i-2004-2010" },
    ],
    "C5": [
      { name: "III (2008-)", slug: "gen-iii-2008" },
      { name: "II (2004-2008)", slug: "gen-ii-2004-2008" },
      { name: "I (2001-2004)", slug: "gen-i-2001-2004" },
    ],
  },

  "Dacia": {
    "Duster": [
      { name: "II (2017-2024)", slug: "gen-ii-2017" },
      { name: "I (2009-2017)", slug: "gen-i-2009-2017" },
      { name: "III (2024-)", slug: "gen-iii-2024" },
    ],
    "Sandero": [
      { name: "III (2020-)", slug: "gen-iii-2020-sandero" },
      { name: "II (2012-2020)", slug: "gen-ii-2012-sandero" },
      { name: "I (2008-2012)", slug: "gen-i-2008-2012-sandero" },
    ],
  },

  "Fiat": {
    "500": [
      { name: "I (2007-2020)", slug: "gen-i-2007-2020" },
      { name: "II (2020-)", slug: "gen-ii-2020" },
    ],
    "Punto": [
      { name: "II FL (2003-)", slug: "gen-ii-fl-2003" },
      { name: "II (1999-2003)", slug: "gen-ii-1999-2003" },
      { name: "I (1994-1999)", slug: "gen-i-1994-1999" },
    ],
    "Tipo": [
      { name: "II (2016-)", slug: "gen-ii-2016" },
      { name: "I (1988-1995)", slug: "gen-i-1988-1995" },
    ],
  },

  "Ford": {
    "Fiesta": [
      { name: "Mk7 (2008-)", slug: "gen-mk7-2008" },
      { name: "Mk8 (2017-)", slug: "gen-mk8-2017" },
      { name: "Mk6 (2002-2008)", slug: "gen-mk6-2002-2008" },
    ],
    "Focus": [
      { name: "Mk3 (2010-2018)", slug: "gen-mk3-2010" },
      { name: "Mk4 (2018-)", slug: "gen-mk4-2018" },
      { name: "Mk2 (2004-2011)", slug: "gen-mk2-2004-2011" },
      { name: "Mk1 (1998-2004)", slug: "gen-mk1-1998-2004" },
    ],
    "Kuga": [
      { name: "II (2012-)", slug: "gen-ii-2012-kuga" },
      { name: "III (2019 - )", slug: "gen-ford-kuga-iii" },
      { name: "I (2008-2012)", slug: "gen-i-2008-2012" },
    ],
    "Mondeo": [
      { name: "Mk5 (2014-)", slug: "gen-mk5-2014" },
      { name: "Mk4 (2007-2014)", slug: "gen-mk4-2007-2014" },
      { name: "Mk3 (2000-2006)", slug: "gen-mk3-2000-2006" },
      { name: "Mk2 (1996-2000)", slug: "gen-mk2-1996-2000" },
    ],
  },

  "Honda": {
    "Civic": [
      { name: "VIII (2006-2011)", slug: "gen-viii-2006-2011" },
      { name: "IX (2011-2017)", slug: "gen-ix-2011" },
      { name: "X (2017-2021)", slug: "gen-x-2017" },
      { name: "XI (2021-)", slug: "gen-xi-2021" },
      { name: "VII (2001-2006)", slug: "gen-vii-2001-2006" },
      { name: "VI (1995-2001)", slug: "gen-vi-1995-2001" },
      { name: "V (1991-1996)", slug: "gen-v-1991-1996" },
    ],
    "CR-V": [
      { name: "IV (2012-2018)", slug: "gen-iv-2012-cr-v" },
      { name: "III (2006-2012)", slug: "gen-iii-2006-2012" },
      { name: "V (2018-2023)", slug: "gen-v-2018" },
      { name: "VI (2023-)", slug: "gen-vi-2023" },
      { name: "II (2001-2006)", slug: "gen-ii-2001-2006" },
      { name: "I (1995-2001)", slug: "gen-i-1995-2001-cr-v" },
    ],
  },

  "Hyundai": {
    "i20": [
      { name: "III (2020-)", slug: "gen-iii-2020" },
      { name: "II (2014-2020)", slug: "gen-ii-2014" },
      { name: "I (2008-2014)", slug: "gen-i-2008-2014" },
    ],
    "i30": [
      { name: "III (2017-)", slug: "gen-iii-2017" },
      { name: "II (2012-2017)", slug: "gen-ii-2012-i30" },
      { name: "I (2007-2012)", slug: "gen-i-2007-2012" },
    ],
    "Kona": [
      { name: "I (2017-2023)", slug: "gen-i-2017-2023" },
      { name: "II (2023-)", slug: "gen-ii-2023" },
    ],
    "Santa Fe": [
      { name: "IV (2018-2024)", slug: "gen-iv-2018" },
      { name: "V (2023-)", slug: "gen-v-2023" },
      { name: "III (2012-2018)", slug: "gen-iii-2012-santa-fe" },
      { name: "II (2006-2012)", slug: "gen-ii-2006-2012" },
      { name: "I (2000-2006)", slug: "gen-i-2000-2006" },
    ],
    "Tucson": [
      { name: "III (2015-2020)", slug: "gen-iii-2015-2020" },
      { name: "IV (2020-)", slug: "gen-iv-2020" },
      { name: "I (2004-2010)", slug: "gen-i-2004-2010-tucson" },
      { name: "II (2010-2015)", slug: "gen-ii-2015" },
    ],
  },

  "Kia": {
    "Ceed": [
      { name: "III (2018-)", slug: "gen-iii-2018" },
      { name: "II (2012-)", slug: "gen-ii-2012-ceed" },
      { name: "I (2006-2012)", slug: "gen-i-2006-2012" },
    ],
    "Picanto": [
      { name: "III (2017-)", slug: "gen-iii-2017-picanto" },
      { name: "II (2011-)", slug: "gen-ii-2011" },
      { name: "I (2004-2010)", slug: "gen-i-2004-2010-picanto" },
    ],
    "Rio": [
      { name: "III (2011-)", slug: "gen-iii-2011-rio" },
      { name: "IV (2017-)", slug: "gen-iv-2017" },
      { name: "II (2005-2011)", slug: "gen-ii-2005-2011-rio" },
      { name: "I (2000-2005)", slug: "gen-i-2000-2005" },
    ],
    "Sorento": [
      { name: "IV (2020-)", slug: "gen-iv-2020-sorento" },
      { name: "III (2015-2020)", slug: "gen-iii-2015-sorento" },
      { name: "II (2009-2015)", slug: "gen-ii-2009-2015" },
      { name: "I (2002-2009)", slug: "gen-i-2002-2009-sorento" },
    ],
    "Sportage": [
      { name: "V (2021-)", slug: "gen-v-2021-sportage" },
      { name: "IV (2016-2021)", slug: "gen-iv-2016-sportage" },
      { name: "III (2010-2015)", slug: "gen-iii-2010-2015" },
      { name: "II (2004-2010)", slug: "gen-ii-2004-2010" },
      { name: "I (1994-2002)", slug: "gen-i-1994-2002" },
    ],
  },

  "Mazda": {
    "3": [
      { name: "IV (2019-)", slug: "gen-iv-2019-3" },
      { name: "III (2013-)", slug: "gen-iii-2013-3" },
      { name: "II (2009-2013)", slug: "gen-ii-2009-2013" },
      { name: "I (2003-2009)", slug: "gen-i-2003-2009" },
    ],
    "6": [
      { name: "III (2012-)", slug: "gen-iii-2012-6" },
      { name: "II (2007-2013)", slug: "gen-ii-2007-2013-6" },
      { name: "I (2002-2008)", slug: "gen-i-2002-2008" },
    ],
    "CX-5": [
      { name: "II (2017-2025)", slug: "gen-ii-2017" },
      { name: "I (2012-2017)", slug: "gen-i-2012-2017" },
      { name: "III (2025-)", slug: "gen-iii-2025-cx5" },
    ],
  },

  "Mercedes-Benz": {
    "Klasa A": [
      { name: "W168 (1997-2004)", slug: "gen-w168-1997-2004" },
      { name: "W169 (2004-2012)", slug: "gen-w169-2004-2012" },
      { name: "W176 (2012-2018)", slug: "gen-w176-2012" },
      { name: "W177 (2018-)", slug: "gen-w177-2018" },
    ],
    "Klasa B": [
      { name: "W245 (2005-2011)", slug: "gen-w245-2005-2011" },
      { name: "W246 (2012-2018)", slug: "gen-w246-2012" },
      { name: "W247 (2019-)", slug: "gen-w247-2019" },
    ],
    "Klasa C": [
      { name: "W202 (1993-2001)", slug: "gen-w202-1993-2001" },
      { name: "W203 (2000-2007)", slug: "gen-w203-2000-2007" },
      { name: "W204 (2007-2014)", slug: "gen-w204-2007-2014" },
      { name: "W205 (2014-2021)", slug: "gen-w205-2014" },
      { name: "W206 (2021-)", slug: "gen-w206-2021" },
    ],
    "Klasa E": [
      { name: "W210 (1995-2002)", slug: "gen-w210-1995-2002" },
      { name: "W211 (2002-2009)", slug: "gen-w211-2002-2009" },
      { name: "W212 (2009-2016)", slug: "gen-w212-2009" },
      { name: "W213 (2016-2023)", slug: "gen-w213-2016" },
      { name: "W214 (2023-)", slug: "gen-w214-2023" },
    ],
    "Klasa GLA": [
      { name: "X156 (2014-2019)", slug: "gen-x156-2014" },
      { name: "H247 (2020-)", slug: "gen-h247-2020" },
    ],
    "Klasa GLC": [
      { name: "X253 (2015-2022)", slug: "gen-x253-2015" },
      { name: "X254 (2022-)", slug: "gen-x254-2022" },
    ],
    "Klasa GLE": [
      { name: "W166 (2015-2019)", slug: "gen-w166-2015" },
      { name: "V167 (2019-)", slug: "gen-v167-2019" },
    ],
    "Klasa S": [
      { name: "W220 (1998-2005)", slug: "gen-w220-1998-2005" },
      { name: "W221 (2005-2013)", slug: "gen-w221-2005-2013" },
      { name: "W222 (2013-2020)", slug: "gen-w222-2013" },
      { name: "W223 (2020-)", slug: "gen-w223-2020" },
    ],
  },

  "Nissan": {
    "Juke": [
      { name: "I (2010-2019)", slug: "gen-i-2010-2019" },
      { name: "II (2019-)", slug: "gen-ii-2019" },
    ],
    "Qashqai": [
      { name: "II (2013-2021)", slug: "gen-ii-2013" },
      { name: "I (2007-2013)", slug: "gen-i-2007-2013" },
      { name: "III (2021-)", slug: "gen-iii-2021" },
    ],
  },

  "Opel": {
    "Astra": [
      { name: "J (2009-2019)", slug: "gen-j-2009-2015" },
      { name: "K (2015-2021)", slug: "gen-k-2009-2015" },
      { name: "H (2004-2014)", slug: "gen-h-2004-2013" },
      { name: "L (2021-)", slug: "gen-l-2021" },
      { name: "G (1998-2009)", slug: "gen-g-1998-2009" },
      { name: "F (1991-2002)", slug: "gen-f-1991-2002" },
    ],
    "Corsa": [
      { name: "D (2006-2014)", slug: "gen-d-2006-2014" },
      { name: "E (2014-2019)", slug: "gen-e-2014" },
      { name: "F (2019-)", slug: "gen-f-2019" },
      { name: "C (2000-2006)", slug: "gen-c-2000-2006" },
      { name: "B (1993-2000)", slug: "gen-b-1993-2000" },
    ],
    "Insignia": [
      { name: "A (2008-2017)", slug: "gen-a-2008-2017" },
      { name: "B (2017-)", slug: "gen-b-2017" },
    ],
    "Mokka": [
      { name: "I (2012-2019)", slug: "gen-i-2012-2019-mokka" },
      { name: "II (2020-)", slug: "gen-ii-2020-mokka" },
    ],
  },

  "Peugeot": {
    "206": [
      { name: "206 (1998-2012)", slug: "gen-206-1998-2012" },
    ],
    "207": [
      { name: "207 (2006-2012)", slug: "gen-207-2006-2012" },
    ],
    "208": [
      { name: "I (2012-2019)", slug: "gen-i-2012-2019" },
      { name: "II (2019-)", slug: "gen-ii-2019" },
    ],
    "308": [
      { name: "T9 (2014-2021)", slug: "gen-t8-2014" },
      { name: "P5 (2021-)", slug: "gen-p5-2021" },
      { name: "T7 (2008-2013)", slug: "gen-t7-2008-2013" },
    ],
    "508": [
      { name: "I (2010-2018)", slug: "gen-i-2010-2018" },
      { name: "II (2018-)", slug: "gen-ii-2018" },
    ],
    "3008": [
      { name: "II (2016-2024)", slug: "gen-ii-2016-3008" },
      { name: "I (2009-2016)", slug: "gen-i-2009-2016" },
      { name: "III (2024-)", slug: "gen-iii-2023" },
    ],
  },

  "Renault": {
    "Captur": [
      { name: "I (2013-2019)", slug: "gen-i" },
      { name: "II (2019-)", slug: "gen-ii" },
    ],
    "Clio": [
      { name: "IV (2012-2018)", slug: "gen-iv-2012-clio" },
      { name: "V (2019-)", slug: "gen-v-2019" },
      { name: "III (2005-2012)", slug: "gen-iii-2005-2012" },
      { name: "II (1998-2012)", slug: "gen-ii-1998-2012" },
      { name: "I (1990-1998)", slug: "gen-i-1990-1998" },
    ],
    "Megane": [
      { name: "IV (2016-)", slug: "gen-iv-2016" },
      { name: "III (2008-2016)", slug: "gen-iii-2008-2016" },
      { name: "II (2002-2008)", slug: "gen-ii-2002-2008" },
      { name: "I (1996-2002)", slug: "gen-i-1996-2002" },
    ],
    "Scenic": [
      { name: "III (2009-2016)", slug: "gen-iii-2009-2013" },
      { name: "IV (2016-)", slug: "gen-iv-2013" },
      { name: "II (2003-2009)", slug: "gen-ii-2003-2009-scenic" },
      { name: "I (1997-2003)", slug: "gen-i-1997-2003" },
    ],
  },

  "Seat": {
    "Ateca": [
      { name: "I (2016-)", slug: "gen-i-2016" },
    ],
    "Ibiza": [
      { name: "IV (2008-2017)", slug: "gen-iv-2008" },
      { name: "V (2017-)", slug: "gen-v-2017" },
      { name: "III (2002-2008)", slug: "gen-iii-2002-2008" },
      { name: "II FL (1999-2002)", slug: "gen-ii-fl-1999-2002" },
    ],
    "Leon": [
      { name: "III (2012-)", slug: "gen-iii-2012" },
      { name: "II (2005-2012)", slug: "gen-ii-2005-2012" },
      { name: "IV (2020 - )", slug: "gen-seat-leon-iv" },
      { name: "I (1999-2005)", slug: "gen-i-1999-2005-leon" },
    ],
  },

  "Skoda": {
    "Fabia": [
      { name: "III (2014-2021)", slug: "gen-iii-2014" },
      { name: "IV (2021-)", slug: "gen-iv-2021" },
      { name: "II (2007-2014)", slug: "gen-ii-2007" },
      { name: "I (1999-2008)", slug: "gen-i-1999-2008" },
    ],
    "Karoq": [
      { name: "I (2017-)", slug: "gen-i-2017" },
    ],
    "Kodiaq": [
      { name: "I (2016-2024)", slug: "gen-i-2016-2024" },
      { name: "II (2024-)", slug: "gen-ii-2024" },
    ],
    "Octavia": [
      { name: "IV (2020-)", slug: "gen-iv-2019-octavia" },
      { name: "III (2013-)", slug: "gen-iii-2013" },
      { name: "II (2004-2013)", slug: "gen-ii-2004-2013" },
      { name: "I (1996-2011)", slug: "gen-i-1996-2011" },
    ],
    "Superb": [
      { name: "III (2015-2023)", slug: "gen-iii-2015" },
      { name: "IV (2023-)", slug: "gen-iv-2023" },
      { name: "II (2008-2018)", slug: "gen-ii-2008" },
      { name: "I (2001-2008)", slug: "gen-i-2001-2008" },
    ],
  },

  "Toyota": {
    "Auris": [
      { name: "II (2012-)", slug: "gen-ii-2012" },
      { name: "I (2006-2012)", slug: "gen-i-2006-2012-auris" },
    ],
    "Avensis": [
      { name: "III (2009-)", slug: "gen-iii-2009" },
      { name: "II (2003-2009)", slug: "gen-ii-2003-2009" },
      { name: "I (1997-2002)", slug: "gen-i-1997-2002" },
    ],
    "C-HR": [
      { name: "I (2016-2023)", slug: "gen-i-2016" },
      { name: "II (2023-)", slug: "gen-ii-2023" },
    ],
    "Corolla": [
      { name: "Seria E21 (2019-)", slug: "gen-e21-2019" },
      { name: "Seria E16 (2012-2019)", slug: "gen-seria-e16-2012" },
      { name: "Seria E12 (2001-2007)", slug: "gen-seria-e12-2001-2007" },
      { name: "Seria E15 (2007-2013)", slug: "gen-seria-e15-2007" },
      { name: "Seria E11 (1997-2002)", slug: "gen-seria-e11-1997-2002" },
      { name: "E8 i starsze (-1987)", slug: "gen-e8-i-starsze-1987" },
    ],
    "Land Cruiser": [
      { name: "VII (2017-)", slug: "gen-vii-2017" },
      { name: "IV (2002-2010)", slug: "gen-iv-2002-2009" },
      { name: "VI (2010-2017)", slug: "gen-vi-2010" },
      { name: "V (2007-2010)", slug: "gen-v-2008-2010" },
      { name: "III (1996-2002)", slug: "gen-iii-1996-2002" },
      { name: "I (1981-1990)", slug: "gen-i-1981-1990" },
      { name: "II (1989-1997)", slug: "gen-ii-1989-1997" },
    ],
    "RAV4": [
      { name: "V (2018-)", slug: "gen-v-2018-rav4" },
      { name: "IV (2012-2018)", slug: "gen-iv-2012" },
      { name: "III (2006-2012)", slug: "gen-iii-2006-2012-rav4" },
      { name: "II (2000-2005)", slug: "gen-ii-2000-2005" },
      { name: "I (1994-2000)", slug: "gen-i-1994-2000" },
    ],
    "Yaris": [
      { name: "III (2011-2019)", slug: "gen-iii-2011" },
      { name: "IV (2020-)", slug: "gen-iv-2020" },
      { name: "II (2005-2011)", slug: "gen-ii-2005-2011" },
      { name: "I (1999-2005)", slug: "gen-i-1999-2005" },
    ],
  },

  "Volkswagen": {
    "Golf": [
      { name: "VII (2012-2020)", slug: "gen-vii-2012" },
      { name: "VIII (2020-)", slug: "gen-viii-2020" },
      { name: "VI (2008-2013)", slug: "gen-vi-2008-2013" },
      { name: "V (2003-2009)", slug: "gen-v-2003-2009" },
      { name: "IV (1997-2006)", slug: "gen-iv-1997-2006" },
      { name: "II (1983-1992)", slug: "gen-ii-1983-1992" },
      { name: "III (1991-1998)", slug: "gen-iii-1991-1998" },
      { name: "I (1974-1983)", slug: "gen-i-1974-1983" },
    ],
    "Passat": [
      { name: "B8 (2014-2023)", slug: "gen-b8-2014" },
      { name: "B7 (2010-2014)", slug: "gen-b7-2010-2014" },
      { name: "B6 (2005-2010)", slug: "gen-b6-2005-2010" },
      { name: "B9 (2023-)", slug: "gen-b9-2023" },
      { name: "B5 FL (2000-2005)", slug: "gen-b5-fl-2000-2005" },
      { name: "B5 (1996-2000)", slug: "gen-b5-1996-2000" },
      { name: "B3 (1988-1993)", slug: "gen-b3-1988-1993" },
      { name: "B2 (1981-1987)", slug: "gen-b2-1981-1987" },
    ],
    "Polo": [
      { name: "V (2009-2017)", slug: "gen-v-2009" },
      { name: "VI (2017-)", slug: "gen-vi-2017" },
      { name: "IV (2001-2009)", slug: "gen-iv-2001-2009" },
      { name: "III (1994-2001)", slug: "gen-iii-1994-2001" },
      { name: "II (1981-1994)", slug: "gen-ii-1981-1994" },
    ],
    "T-Roc": [
      { name: "I (2017-2025)", slug: "gen-i-2017-2025" },
      { name: "II (2025-)", slug: "gen-ii-2025" },
    ],
    "Tiguan": [
      { name: "II (2016-2024)", slug: "gen-ii-2016-tiguan" },
      { name: "I (2007-2016)", slug: "gen-i-2007-2016" },
      { name: "III (2024-)", slug: "gen-iii-2024-tiguan" },
    ],
    "Touareg": [
      { name: "III (2018-)", slug: "gen-iii-2018-touareg" },
      { name: "II (2010-)", slug: "gen-ii-2010-touareg" },
      { name: "I (2002-2010)", slug: "gen-i-2002-2010-touareg" },
    ],
    "Touran": [
      { name: "III (2015-)", slug: "gen-iii-2015-touran" },
      { name: "II (2010-2015)", slug: "gen-ii-2010-2015" },
      { name: "I (2003-2010)", slug: "gen-i-2003-2010" },
    ],
  },

  "Volvo": {
    "S60": [
      { name: "II (2010-)", slug: "gen-ii-2010-s60" },
      { name: "III (2018-)", slug: "gen-iii-2018-s60" },
      { name: "I (2000-2010)", slug: "gen-i-2000-2010" },
    ],
    "S80": [
      { name: "II (2006-)", slug: "gen-ii-2006" },
      { name: "I (1998-2006)", slug: "gen-i-1998-2006" },
    ],
    "V40": [
      { name: "II (2012-)", slug: "gen-ii-2012-v40" },
      { name: "I (1995-2004)", slug: "gen-i-1995-2004" },
    ],
    "V60": [
      { name: "II (2018- )", slug: "gen-ii-2018" },
      { name: "I (2011-2018)", slug: "gen-i-2011-2018" },
    ],
    "V70": [
      { name: "III (2007-)", slug: "gen-iii-2007-v70" },
      { name: "II (1999-2007)", slug: "gen-ii-1999-2007" },
      { name: "I (1997-2000)", slug: "gen-i-1997-2000" },
    ],
    "XC40": [
      { name: "I (2018-)", slug: "gen-i-2018" },
    ],
    "XC60": [
      { name: "I (2008-2017)", slug: "gen-i-2008-2017" },
      { name: "II (2017-)", slug: "gen-ii-2017" },
    ],
    "XC90": [
      { name: "I (2002-2014)", slug: "gen-i-2002-2014" },
      { name: "II (2015-)", slug: "gen-ii-2015" },
    ],
  },
};
