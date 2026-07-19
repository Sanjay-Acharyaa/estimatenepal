export const NEPAL_DISTRICTS = [
  "Achham","Arghakhanchi","Baglung","Bajhang","Bajura","Banke","Bara","Bardiya",
  "Bhaktapur","Bhojpur","Chitwan","Dadeldhura","Dailekh","Dang","Darchula",
  "Dhading","Dhankuta","Dhanusha","Dolakha","Dolpa","Doti","Gorkha","Gulmi",
  "Humla","Ilam","Jajarkot","Jhapa","Jumla","Kailali","Kalikot","Kanchanpur",
  "Kapilvastu","Kaski","Kathmandu","Kavrepalanchok","Khotang","Lalitpur","Lamjung",
  "Mahottari","Makwanpur","Manang","Morang","Mugu","Mustang","Myagdi","Nawalparasi East",
  "Nawalparasi West","Nuwakot","Okhaldhunga","Palpa","Panchthar","Parbat","Parsa",
  "Pyuthan","Ramechhap","Rasuwa","Rautahat","Rolpa","Rukum East","Rukum West",
  "Rupandehi","Salyan","Sankhuwasabha","Saptari","Sarlahi","Sindhuli","Sindhupalchok",
  "Siraha","Solukhumbu","Sunsari","Surkhet","Syangja","Tanahu","Taplejung",
  "Terhathum","Udayapur",
].sort();

export type NepalDistrict = typeof NEPAL_DISTRICTS[number];

export const COMMON_UNITS: { label: string; value: string }[] = [
  { label: "Cu.m  -  Cubic Metre",         value: "Cu.m"  },
  { label: "Sq.m  -  Square Metre",        value: "Sq.m"  },
  { label: "Rmt  -  Running Metre",        value: "Rmt"   },
  { label: "Cu.ft  -  Cubic Feet",         value: "Cu.ft" },
  { label: "Sq.ft  -  Square Feet",        value: "Sq.ft" },
  { label: "Rft  -  Running Feet",         value: "Rft"   },
  { label: "Kg  -  Kilogram",              value: "Kg"    },
  { label: "MT  -  Metric Ton",            value: "MT"    },
  { label: "No.  -  Number / Each",        value: "No."   },
  { label: "LS  -  Lump Sum",              value: "LS"    },
  { label: "Bag  -  Cement bag (50 kg)",   value: "Bag"   },
  { label: "Litre",                      value: "Litre" },
  { label: "Day  -  Equipment/labour day", value: "Day"   },
  { label: "Set",                        value: "Set"   },
  { label: "Pair",                       value: "Pair"  },
  { label: "Point",                      value: "Point" },
];

export const ASSEMBLY_CATEGORIES = [
  "Structural",
  "Civil",
  "MEP",
  "Architectural",
  "Road",
  "Irrigation",
];
