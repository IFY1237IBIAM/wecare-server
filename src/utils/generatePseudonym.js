const animals = ['Willow','Robin','River','Sparrow','Ash','Moss','Nova','Orion','Luna','Echo'];
const adjectives = ['Quiet','Gentle','Bright','Solemn','Brave','Kind','Soft','Warm','Calm','Hopeful'];

function randomFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

module.exports = function generatePseudonym(){
  return `${randomFrom(adjectives)} ${randomFrom(animals)}${Math.floor(Math.random()*900 + 100)}`;
};
