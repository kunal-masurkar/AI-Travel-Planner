import type { Destination } from "../types.js";

export const agra: Destination = {
  key: "agra",
  name: "Agra",
  state: "Uttar Pradesh",
  aliases: ["taj mahal", "fatehpur sikri"],
  emoji: "🕌",
  tagline: "The Taj Mahal & Mughal splendour",
  description:
    "Home to the Taj Mahal, Agra Fort and the abandoned Mughal capital of Fatehpur Sikri — three UNESCO sites within an hour of each other.",
  wiki: "Agra",
  center: { lat: 27.1767, lon: 78.0081 },
  gatewayBase: "agra",
  bases: [{ key: "agra", name: "Agra", lat: 27.17, lon: 78.035 }],
  highlights: ["Taj Mahal at sunrise", "Agra Fort", "Fatehpur Sikri", "Mehtab Bagh sunset"],
  interests: ["history", "culture", "food"],
  season: {
    bestMonths: [10, 11, 12, 1, 2, 3],
    summary: "October to March is pleasant; December–January mornings can be foggy enough to hide the Taj.",
    periods: [
      { name: "Winter", months: [10, 11, 12, 1, 2, 3], tempC: [7, 28], rainfall: "low", crowds: "very high", notes: "Peak season; dense fog possible at dawn in Dec–Jan." },
      { name: "Summer", months: [4, 5, 6], tempC: [27, 46], rainfall: "low", crowds: "moderate", notes: "Very hot — the white marble is blinding at midday." },
      { name: "Monsoon", months: [7, 8, 9], tempC: [26, 35], rainfall: "high", crowds: "low", notes: "Humid, with dramatic skies over the Yamuna." },
    ],
    festivals: [
      { name: "Taj Mahotsav", months: [2], description: "Ten-day crafts, food and culture fair at Shilpgram (18–27 Feb)." },
      { name: "Ram Barat", months: [9], description: "Grand procession re-enacting Lord Ram's wedding." },
      { name: "Holi", months: [3], description: "Celebrated with gusto; nearby Mathura–Vrindavan is famous for it." },
    ],
    seasonalActivities: [
      { months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], activity: "Taj Mahal night viewing on full-moon nights (±2 days)" },
    ],
    considerations: [
      "The Taj Mahal is closed every Friday.",
      "Only small bags, phones and cameras are allowed inside the Taj; no food or tripods.",
      "Fatehpur Sikri is 40 km away — allow half a day.",
    ],
  },
  mustTryDishes: [
    { name: "Petha", description: "Translucent ash-gourd sweet, Agra's signature." },
    { name: "Bedai & jalebi", description: "Spiced kachori-style breakfast with hot jalebis." },
    { name: "Mughlai korma", description: "Rich, nutty Mughal curry." },
    { name: "Dalmoth", description: "Crunchy spiced lentil snack." },
  ],
  attractions: [
    { id: "agr-taj", name: "Taj Mahal at Sunrise", area: "Taj Ganj", base: "agra", type: "historical", interests: ["history", "culture"], lat: 27.1751, lon: 78.0421, description: "Shah Jahan's white-marble mausoleum, glowing pink and gold at dawn.", openingHours: "Sunrise–sunset, closed Fri", entryFeeInr: 250, durationMin: 150, bestTime: "sunrise", closedDays: [5], popularity: 5, wiki: "Taj Mahal", tips: "Ticket includes the main mausoleum (₹200 add-on); use the East Gate for shorter queues." },
    { id: "agr-fort", name: "Agra Fort", area: "Rakabganj", base: "agra", type: "historical", interests: ["history"], lat: 27.1795, lon: 78.0211, description: "Red sandstone citadel of the Mughals where Shah Jahan spent his last years gazing at the Taj.", openingHours: "06:00–18:00 daily", entryFeeInr: 50, durationMin: 120, bestTime: "morning", popularity: 5, wiki: "Agra Fort" },
    { id: "agr-baby-taj", name: "Itimad-ud-Daulah ('Baby Taj')", area: "Moti Bagh", base: "agra", type: "hidden-gem", interests: ["history"], lat: 27.1925, lon: 78.031, description: "Jewel-box tomb with exquisite pietra dura — a precursor to the Taj.", openingHours: "Sunrise–sunset daily", entryFeeInr: 30, durationMin: 60, bestTime: "afternoon", popularity: 3, wiki: "Tomb of I'timād-ud-Daulah" },
    { id: "agr-chini-ka-rauza", name: "Chini ka Rauza", area: "Moti Bagh", base: "agra", type: "hidden-gem", interests: ["history"], lat: 27.196, lon: 78.0335, description: "Tomb faced with rare Persian glazed tiles, almost always deserted.", openingHours: "Sunrise–sunset daily", entryFeeInr: 0, durationMin: 30, bestTime: "afternoon", popularity: 1, wiki: "Chini Ka Rauza" },
    { id: "agr-mehtab-bagh", name: "Mehtab Bagh Sunset", area: "Across the Yamuna", base: "agra", type: "nature", interests: ["nature", "history"], lat: 27.1795, lon: 78.0444, description: "Moonlight garden across the river with the classic sunset view of the Taj.", openingHours: "Sunrise–sunset daily", entryFeeInr: 30, durationMin: 60, bestTime: "sunset", popularity: 4, wiki: "Mehtab Bagh" },
    { id: "agr-fatehpur-sikri", name: "Fatehpur Sikri", area: "Fatehpur Sikri", base: "agra", type: "historical", interests: ["history", "spiritual"], lat: 27.0945, lon: 77.6679, description: "Akbar's red sandstone 'City of Victory', abandoned after just 14 years.", openingHours: "Sunrise–sunset daily", entryFeeInr: 50, durationMin: 180, bestTime: "morning", popularity: 4, wiki: "Fatehpur Sikri" },
    { id: "agr-akbar-tomb", name: "Akbar's Tomb, Sikandra", area: "Sikandra", base: "agra", type: "historical", interests: ["history"], lat: 27.2208, lon: 77.9505, description: "Grand gateway and tomb set in parkland roamed by deer and langurs.", openingHours: "Sunrise–sunset daily", entryFeeInr: 30, durationMin: 75, bestTime: "afternoon", popularity: 3, wiki: "Akbar's tomb" },
    { id: "agr-kinari-bazaar", name: "Kinari Bazaar & Sadar Market", area: "Old City", base: "agra", type: "shopping", interests: ["shopping", "food"], lat: 27.188, lon: 78.018, description: "Old-city lanes for petha, marble inlay souvenirs and leather goods.", openingHours: "10:00–21:00", entryFeeInr: 0, durationMin: 90, bestTime: "evening", popularity: 3 },
    { id: "agr-mohabbat-show", name: "Mohabbat the Taj Show (Kalakriti)", area: "Taj Ganj", base: "agra", type: "culture", interests: ["culture"], lat: 27.163, lon: 78.044, description: "Theatrical musical retelling the love story behind the Taj.", openingHours: "Daily show ~18:30", entryFeeInr: 0, activityFeeInr: 1500, durationMin: 90, bestTime: "evening", popularity: 3, indoor: true },
  ],
  restaurants: [
    { id: "agr-deviram", name: "Deviram Sweets", area: "Pratap Pura", base: "agra", lat: 27.185, lon: 78.01, cuisine: "Breakfast & sweets", specialties: ["Bedai", "Jalebi"], priceTier: "budget", costForTwoInr: 200, rating: 4.3, openingHours: "07:00–22:00", familyFriendly: true, snackOnly: true },
    { id: "agr-joneys", name: "Joney's Place", area: "Taj Ganj", base: "agra", lat: 27.17, lon: 78.042, cuisine: "Backpacker café", specialties: ["Malai kofta", "Banana lassi"], priceTier: "budget", costForTwoInr: 300, rating: 4.2, openingHours: "06:00–22:30", familyFriendly: true },
    { id: "agr-sheroes", name: "Sheroes Hangout", area: "Fatehabad Road", base: "agra", lat: 27.165, lon: 78.04, cuisine: "Café (pay what you wish)", specialties: ["Sandwiches", "Coffee"], priceTier: "budget", costForTwoInr: 500, rating: 4.7, openingHours: "10:00–22:00", familyFriendly: true, snackOnly: true },
    { id: "agr-dasaprakash", name: "Dasaprakash", area: "Meher Theatre", base: "agra", lat: 27.165, lon: 78.011, cuisine: "South Indian", specialties: ["Thali", "Ice-cream sundaes"], priceTier: "mid", costForTwoInr: 900, rating: 4.2, openingHours: "11:00–23:00", familyFriendly: true },
    { id: "agr-pinch-of-spice", name: "Pinch of Spice", area: "Fatehabad Road", base: "agra", lat: 27.163, lon: 78.035, cuisine: "North Indian", specialties: ["Dal makhani", "Mughlai korma"], priceTier: "mid", costForTwoInr: 1500, rating: 4.3, openingHours: "12:00–23:30", familyFriendly: true },
    { id: "agr-peshawri", name: "Peshawri (ITC Mughal)", area: "Fatehabad Road", base: "agra", lat: 27.16, lon: 78.048, cuisine: "North-West Frontier", specialties: ["Dal Bukhara", "Kebabs"], priceTier: "premium", costForTwoInr: 6000, rating: 4.5, openingHours: "12:30–14:45, 19:00–23:45", familyFriendly: true },
    { id: "agr-esphahan", name: "Esphahan (The Oberoi Amarvilas)", area: "Taj East Gate", base: "agra", lat: 27.1676, lon: 78.0505, cuisine: "Mughlai fine dining", specialties: ["Awadhi set menu"], priceTier: "premium", costForTwoInr: 8000, rating: 4.6, openingHours: "18:30–23:30", familyFriendly: true },
  ],
  hotels: [
    { id: "agr-zostel", name: "Zostel Agra", type: "hostel", tier: "budget", base: "agra", area: "Taj Ganj", lat: 27.166, lon: 78.044, pricePerNightInr: 700, rating: 4.4, amenities: ["Rooftop", "Wi-Fi", "Lockers"], description: "Hostel a short walk from the Taj's East Gate." },
    { id: "agr-hotel-kamal", name: "Hotel Kamal", type: "hotel", tier: "budget", base: "agra", area: "Taj Ganj", lat: 27.169, lon: 78.042, pricePerNightInr: 2000, rating: 4.1, amenities: ["Taj-view rooftop", "Wi-Fi"], description: "Simple hotel near the South Gate with Taj rooftop views." },
    { id: "agr-crystal-sarovar", name: "Crystal Sarovar Premiere", type: "hotel", tier: "mid", base: "agra", area: "Fatehabad Road", lat: 27.159, lon: 78.043, pricePerNightInr: 6000, rating: 4.3, amenities: ["Pool", "Restaurant", "Gym"], description: "Modern hotel 2 km from the Taj." },
    { id: "agr-courtyard", name: "Courtyard by Marriott Agra", type: "hotel", tier: "mid", base: "agra", area: "Fatehabad Road", lat: 27.16, lon: 78.039, pricePerNightInr: 7000, rating: 4.3, amenities: ["Pool", "Spa", "Restaurants"], description: "Comfortable chain hotel with Taj views from upper floors." },
    { id: "agr-itc-mughal", name: "ITC Mughal", type: "resort", tier: "premium", base: "agra", area: "Fatehabad Road", lat: 27.16, lon: 78.048, pricePerNightInr: 12000, rating: 4.5, amenities: ["Gardens", "Kaya Kalp spa", "Pool"], description: "Mughal-inspired resort in 35 acres of gardens." },
    { id: "agr-amarvilas", name: "The Oberoi Amarvilas", type: "hotel", tier: "premium", base: "agra", area: "Taj East Gate", lat: 27.1676, lon: 78.0505, pricePerNightInr: 45000, rating: 4.8, amenities: ["Taj view from every room", "Spa", "Pool"], description: "600 m from the Taj, with views from every room." },
  ],
};
