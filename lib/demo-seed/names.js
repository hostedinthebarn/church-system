// Invented names for the demo. Common-sounding first names with surnames
// that are deliberately unusual, so nobody reading the demo takes a person
// for a real member. Every surname is used by one household only.
const MALE = [
  'Abel', 'Alden', 'Barrett', 'Boyd', 'Calvin', 'Clay', 'Dale', 'Dean', 'Elliot', 'Emmett',
  'Felix', 'Grant', 'Hollis', 'Hugh', 'Ira', 'Jasper', 'Karl', 'Lyle', 'Marcus', 'Neil',
  'Orrin', 'Perry', 'Quentin', 'Reid', 'Silas', 'Tobin', 'Vance', 'Warren', 'Wade', 'Zane',
  'Alvin', 'Brent', 'Curtis', 'Dwight', 'Edgar', 'Floyd', 'Glenn', 'Harlan', 'Irving', 'Julian'
];
const FEMALE = [
  'Adela', 'Beth', 'Carla', 'Dora', 'Edie', 'Faye', 'Gwen', 'Hattie', 'Irene', 'Joan',
  'Kay', 'Lena', 'Mabel', 'Nora', 'Opal', 'Pearl', 'Rhea', 'Sadie', 'Tess', 'Una',
  'Vera', 'Willa', 'Yvette', 'Zella', 'Alma', 'Bonnie', 'Clara', 'Dolly', 'Elsie', 'Flora',
  'Greta', 'Hazel', 'Ida', 'Jean', 'Lois', 'Maude', 'Nell', 'Olive', 'Ruth', 'Thea'
];
const KID_MALE = [ 'Ansel', 'Ben', 'Cal', 'Drew', 'Eli', 'Finn', 'Gus', 'Hank', 'Ivan', 'Jude', 'Kit', 'Leo', 'Milo', 'Ned', 'Owen', 'Pip', 'Rex', 'Seth', 'Theo', 'Wes' ];
const KID_FEMALE = [ 'Ada', 'Bree', 'Cora', 'Daisy', 'Ellie', 'Fern', 'Gia', 'Hope', 'Iris', 'June', 'Kira', 'Lily', 'Mae', 'Nina', 'Opie', 'Posy', 'Quinn', 'Rose', 'Sue', 'Tilly' ];
const SURNAMES = [
  'Ashby', 'Birchfield', 'Calloway', 'Dunmore', 'Eastwick', 'Fairlie', 'Garrity', 'Hollowell', 'Ivers', 'Jessup',
  'Kellam', 'Lowry', 'Marlowe', 'Nesbitt', 'Orsini', 'Pemberly', 'Quarles', 'Rathbone', 'Sutter', 'Thackeray',
  'Underhill', 'Vickery', 'Whitcomb', 'Yarrow', 'Zimmerly', 'Alderton', 'Brisco', 'Cobb', 'Dalrymple', 'Everhart',
  'Fenwick', 'Gladstone', 'Hargrove', 'Isley', 'Jarrow', 'Kingsley', 'Lockhart', 'Merriweather', 'Northcutt', 'Oakley'
];
const STREETS = [
  'Pecan St', 'Mill Rd', 'Elm Ln', 'Cedar Ct', 'Prairie Dr', 'Creek Rd', 'Magnolia Ave', 'Depot St',
  'Live Oak Ln', 'Bluebonnet Way', 'Orchard Rd', 'Church St', 'Vine St', 'Ranch Rd', 'Walnut Ave', 'Meadow Ln'
];
const TOWNS = [
  { city: 'La Grange', zip: '78945' },
  { city: 'La Grange', zip: '78945' },
  { city: 'La Grange', zip: '78945' },
  { city: 'Fayetteville', zip: '78940' },
  { city: 'Schulenburg', zip: '78956' },
  { city: 'Round Top', zip: '78954' },
  { city: 'Carmine', zip: '78932' }
];

module.exports = {
  KID_FEMALE,
  KID_MALE,
  FEMALE,
  MALE,
  STREETS,
  SURNAMES,
  TOWNS
};
