const { Schema, model, models } = require("mongoose")
const mongoose = require("mongoose")

const medicalHistorySchema = new mongoose.Schema({
  patologico_metabolico: {
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente metabolico es muy largo"]
    }
  },
  patologico_gastrointestinal: {
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente gastrointestinal es muy largo"]
    }
  },
  patologico_neurologico:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente neurologico es muy largo"]
    }
  },
  patologico_cardiaco:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente cardiaco es muy largo"]
    }
  },
  patologico_genitourinario:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente genitourinario es muy largo"]
    }
  },
  infeccioso_vph:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente vph es muy largo"]
    }
  },
  infeccioso_vih:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente vih es muy largo"]
    }
  },
  infeccioso_hepatitis_a:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente hepatitis A es muy largo"]
    }
  },
  infeccioso_hepatitis_b:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente hepatitis B es muy largo"]
    }
  },
  quirurgico:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente quirurgico es muy largo"]
    }
  },
  toxico_alergico:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente Toxico alergico es muy largo"]
    }
  },
  medicamentos:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"Descripcion de medicamentos es muy largo"]
    }
  },
  hematologicos:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"antecedente hematologicoB es muy largo"]
    }
  },
  examen_clinico:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"Examen clinico es muy largo"]
    }
  },
  paraclinico:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [300,"Descripcion paraclinica es muy largo"]
    }
  },
  diagnostico:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [500,"Diagnostico es muy largo"]
    }
  },
  plan_tratamiento:{
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [500,"Plan de tratamiento es muy largo"]
    }
  },
  observacion_final: {
    checked: {type: Boolean, default: false},
    description: {
      type: String,
      default: "",
      maxLength: [1000,"Observacion final es muy largo"]
    }
  }
})

module.exports = mongoose.model('MedicalHistory', medicalHistorySchema)