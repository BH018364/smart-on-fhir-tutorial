extractData().then(
        //Display Patient Demographics and Observations if extractData was success
        function(p) {
          drawVisualization(p);
        },

        //Display 'Failed to call FHIR Service' if extractData failed
        function() {
          $('#loading').hide();
          $('#errors').html('<p> Failed to call FHIR Service </p>');
        }
      );
	  
	  
function extractData() {
    var ret = $.Deferred();

    function onError() {
      console.log('Loading error', arguments);
      ret.reject();
    }

    function onReady(smart)  {
	  //checking to make sure this has launch scope
      if (smart.hasOwnProperty('patient')) {
        var patient = smart.patient;
        var pt = patient.read();
        var obv = smart.api.fetchAll({
                    "type": 'Observation',
                    "query": {
		      "patient": smart.patient.id,
		      "_count": 100,
                      "code": {
                        "$or": ['http://loinc.org|8302-2', 'http://loinc.org|85354-9',
                              'http://loinc.org|2085-9',
                              'http://loinc.org|2089-1', 'http://loinc.org|8310-5']
                      },
					  "date": 'gt2020-01-01',
					  "category": 'vital-signs'
                    }
                  });
		
        var alg = smart.patient.api.fetchAll({
                    "type": 'AllergyIntolerance',
                    "query": {
                      "clinical-status": 'active'
                    }
                  });

        $.when(pt, obv, alg).fail(onError);

        $.when(pt, obv, alg).done(function(patient, obv, allergies) {
		console.log(smart.patient);
		  console.log(patient);
		  console.log(obv);
		  console.log(allergies);
          var byCodes = smart.byCodes(obv, 'code');
          var gender = patient.gender;
          var dob = new Date(patient.birthDate);
          var day = dob.getDate();
          var monthIndex = dob.getMonth() + 1;
          var year = dob.getFullYear();

          var dobStr = patient.birthDate;//monthIndex + '/' + day + '/' + year;
          var fname = '';
          var lname = '';

          if (typeof patient.name[0] !== 'undefined') {
            fname = patient.name[0].given.join(' ');
            lname = patient.name[0].family;
          }

          var height = byCodes('8302-2');
		  //old discouraged BP 55284-4
          var systolicbp = getBloodPressureValue(byCodes('85354-9'),'8480-6');
          var diastolicbp = getBloodPressureValue(byCodes('85354-9'),'8462-4');
		  var temps = byCodes('8310-5');
          var hdl = byCodes('2085-9');
          var ldl = byCodes('2089-1');
		  var allergyTable = "<table>";
		  var allergyLen = allergies.length;
		  for (var i=0;i<allergyLen;i++){
			  var reactionStr = [];
			  if(allergies[i].reaction !== undefined) {
				  for(var j=0,jLen=allergies[i].reaction.length;j<jLen;j++) {
					  reactionStr.push(allergies[i].reaction[j].manifestation[0].text);
				  }
			  }
			  allergyTable += "<tr><td>"+allergies[i].code.text+"</td><td>"+reactionStr.join(", ")+"</td></tr>";
		  }
		  if (allergyLen === 0) {
			  allergyTable += "<tr><td>No Allergies Documented</td></tr>";
		  }
		  allergyTable += "</table>";

          var p = defaultPatient();
          p.birthdate = dobStr;
          p.gender = gender;
          p.fname = fname;
          p.lname = lname;
          p.age = parseInt(calculateAge(dob));
          p.height = getQuantityValueAndUnit(height[0]);

          if (typeof systolicbp != 'undefined')  {
            p.systolicbp = systolicbp;
          }

          if (typeof diastolicbp != 'undefined') {
            p.diastolicbp = diastolicbp;
          }

          p.hdl = getQuantityValueAndUnit(hdl[0]);
          p.ldl = getQuantityValueAndUnit(ldl[0]);
		  p.temp = getQuantityValueAndUnit(temps[0]);
		  
		  p.allergies = allergyTable;

          ret.resolve(p);
        });
      } else {
        onError();
      }
    }

    FHIR.oauth2.ready(onReady, onError);
    return ret.promise();

};

function defaultPatient(){
    return {
      fname: {value: ''},
      lname: {value: ''},
      gender: {value: ''},
      birthdate: {value: ''},
      age: {value: ''},
      height: {value: ''},
      systolicbp: {value: ''},
      diastolicbp: {value: ''},
      ldl: {value: ''},
      hdl: {value: ''},
	  temp: {value: ''},
	  allergies: {value: ''}
    };
}

function getBloodPressureValue(BPObservations, typeOfPressure) {
    var formattedBPObservations = [];
    BPObservations.forEach(function(observation){
      var BP = observation.component.find(function(component){
        return component.code.coding.find(function(coding) {
          return coding.code == typeOfPressure;
        });
      });
      if (BP) {
        observation.valueQuantity = BP.valueQuantity;
        formattedBPObservations.push(observation);
      }
    });

    return getQuantityValueAndUnit(formattedBPObservations[0]);
}

function isLeapYear(year) {
    return new Date(year, 1, 29).getMonth() === 1;
}

function calculateAge(date) {
    if (Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date.getTime())) {
      var d = new Date(date), now = new Date();
      var years = now.getFullYear() - d.getFullYear();
      d.setFullYear(d.getFullYear() + years);
      if (d > now) {
        years--;
        d.setFullYear(d.getFullYear() - 1);
      }
      var days = (now.getTime() - d.getTime()) / (3600 * 24 * 1000);
      return years + days / (isLeapYear(now.getFullYear()) ? 366 : 365);
    }
    else {
      return undefined;
    }
}

function getQuantityValueAndUnit(ob) {
    if (typeof ob != 'undefined' &&
        typeof ob.valueQuantity != 'undefined' &&
        typeof ob.valueQuantity.value != 'undefined' &&
        typeof ob.valueQuantity.unit != 'undefined') {
          return ob.valueQuantity.value + ' ' + ob.valueQuantity.unit;
    } else {
      return undefined;
    }
}

function drawVisualization(p) {
    $('#holder').show();
    $('#loading').hide();
    $('#fname').html(p.fname);
    $('#lname').html(p.lname);
    $('#gender').html(p.gender);
    $('#birthdate').html(p.birthdate);
    $('#age').html(p.age);
    $('#height').html(p.height);
    $('#systolicbp').html(p.systolicbp);
    $('#diastolicbp').html(p.diastolicbp);
    $('#ldl').html(p.ldl);
    $('#hdl').html(p.hdl);
	$('#temperature').html(p.temp);
	$('#allergyIntolerance').html(p.allergies);
	
};
