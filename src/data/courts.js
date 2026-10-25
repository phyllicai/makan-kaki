// Approximate area centroids (not specific businesses) for common Klang Valley / MY badminton areas.
export const COURTS = [
  { id: 'kepong', label: 'Kepong, Kuala Lumpur', lat: 3.2133, lon: 101.6370 },
  { id: 'ss2', label: 'SS2, Petaling Jaya', lat: 3.1185, lon: 101.6230 },
  { id: 'puchong', label: 'Puchong, Selangor', lat: 3.0245, lon: 101.6170 },
  { id: 'cheras', label: 'Cheras, Kuala Lumpur', lat: 3.0820, lon: 101.7390 },
  { id: 'subang', label: 'SS15, Subang Jaya', lat: 3.0760, lon: 101.5870 },
  { id: 'georgetown', label: 'George Town, Penang', lat: 5.4141, lon: 100.3288 },
  { id: 'jb', label: 'Johor Bahru, Johor', lat: 1.4927, lon: 103.7414 },
];

export const SAMPLE_GROUP = {
  courtId: 'ss2',
  day: 'Thursday',
  endTime: '22:30',
  radiusM: 3000,
  budgetMax: 2,
  members: [
    { name: 'Aina', cravings: 'nasi lemak, ayam penyet, teh tarik', likedPlaces: 'Village Park Restaurant', dietary: ['halal'], spice: 3 },
    { name: 'Wei Jie', cravings: 'char kway teow, wantan mee, dim sum', likedPlaces: 'Jalan Alor', dietary: [], spice: 2 },
    { name: 'Priya', cravings: 'banana leaf, thosai, briyani', likedPlaces: '', dietary: ['vegetarian'], spice: 3 },
    { name: 'Daniel', cravings: 'burger, korean fried chicken', likedPlaces: '', dietary: [], spice: 1 },
  ],
};
