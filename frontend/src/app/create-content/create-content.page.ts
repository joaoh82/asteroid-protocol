import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-create-content',
  templateUrl: './create-content.page.html',
  styleUrls: ['./create-content.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule, RouterLink]
})
export class CreateContentPage implements OnInit {

  // Hold the form for persistance
  createForm: FormGroup;

  constructor(private builder: FormBuilder) {
    this.createForm = this.builder.group({
      basic: this.builder.group({
        name: "",
        description: "",
        imageUpload: null,
      }),
    });
  }

  ngOnInit() {
  }

}
