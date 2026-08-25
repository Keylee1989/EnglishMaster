#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""扩充 articles.json 到 120 篇 (6级×20篇)"""
import json
import os

BASE = r'c:\GitHub上传\EnglishMaster\data'

ARTICLE_TOPICS = {
    1: [
        ("My Family","我的家庭","I have a small family. There are four people in my family. They are my father, my mother, my sister and me. My father is a teacher. My mother is a doctor. My sister is a student. I am a student too. We love each other. We are happy."),
        ("My Day","我的一天","I get up at seven in the morning. I wash my face and brush my teeth. I eat breakfast at half past seven. I go to school at eight. I have lunch at school. I come home at four in the afternoon. I do my homework. I go to bed at nine."),
        ("My Friend","我的朋友","My best friend is Tom. He is ten years old. He is tall and strong. He has short hair and big eyes. He likes playing football. We are in the same class. We play together after school. He is kind and helpful. I like him very much."),
        ("My School","我的学校","My school is big and beautiful. There are many trees and flowers in it. We have a library, a playground and many classrooms. My teachers are kind. My classmates are friendly. I learn Chinese, math and English at school. I love my school."),
        ("My Pet","我的宠物","I have a pet dog. His name is Bobby. He is small and white. He has long ears and a short tail. He likes eating meat and bones. He can run and jump. He is very clever. I play with him every day. He is my good friend."),
        ("My Favorite Food","我最喜欢的食物","I like many foods. I like rice, noodles and dumplings. My favorite food is fish. My mother cooks fish very well. Fish is good for our health. I also like fruit. Apples and bananas are my favorites. I don't like spicy food."),
        ("My Hobbies","我的爱好","I have many hobbies. I like reading books. I like drawing pictures. I like playing basketball. My favorite hobby is reading. I read books every day. Books are my good friends. They teach me many things. I want to be a writer when I grow up."),
        ("My Bedroom","我的卧室","My bedroom is small but nice. There is a bed, a desk and a chair in it. My books are on the desk. My toys are in a box. There is a picture on the wall. It is a picture of my family. I clean my room every week. I love my bedroom."),
        ("A Trip to the Park","公园之旅","Today is Sunday. My family goes to the park. The park is big and clean. Many people are there. Some are walking. Some are running. Some children are playing games. My father and I fly a kite. My mother sits under a tree. We have a picnic there. We are very happy."),
        ("My Mother","我的妈妈","My mother is a kind woman. She is tall and thin. She has long hair and big eyes. She is a nurse. She works in a hospital. She helps sick people. She gets up early every day. She cooks for us. She helps me with my homework. I love my mother."),
        ("The Weather","天气","Today is a sunny day. The sky is blue. The sun is bright. I like sunny days. I can play outside. Yesterday was rainy. I stayed at home. Tomorrow will be cloudy. The weather changes every day. We can watch the weather report on TV. It tells us what to wear."),
        ("My Favorite Animal","我最喜欢的动物","My favorite animal is the panda. Pandas are black and white. They live in China. They eat bamboo. They are cute and lovely. They look like big toys. Pandas are rare. We should protect them. I want to see a real panda one day."),
        ("My Birthday","我的生日","Today is my birthday. I am ten years old. My mother makes a big cake. My father buys me a new bike. My friends come to my party. We sing songs and play games. We eat cake together. I get many gifts. I am very happy today."),
        ("Shopping","购物","My mother and I go shopping today. We go to the supermarket. We buy some milk, eggs and bread. We buy some fruit too. Apples are five yuan a kilo. Bananas are four yuan. My mother buys me a chocolate. We are happy."),
        ("My Teacher","我的老师","My favorite teacher is Miss Wang. She is my English teacher. She is young and pretty. She has long hair. She speaks English very well. Her classes are fun. She tells us stories. She is patient with us. She helps us a lot. We all like her."),
        ("Sports","运动","I like sports. I can run. I can jump. I can swim. My favorite sport is basketball. I play it after school. I am on the school team. We practice every day. Sports make me strong. Sports make me happy. I want to be a player."),
        ("Spring Festival","春节","Spring Festival is the Chinese New Year. It is in January or February. Families get together. We eat dumplings and fish. Children get red packets. We watch the Spring Festival Gala on TV. We light fireworks. We visit our relatives. Everyone is happy."),
        ("A Happy Sunday","快乐的星期天","Today is Sunday. I don't go to school. I get up at eight. I eat breakfast with my family. Then I do my homework. In the afternoon, I play with my friends. We ride bikes in the park. In the evening, I read a book. I go to bed at nine. What a happy day!"),
        ("Colors","颜色","There are many colors in the world. Red is the color of apples. Yellow is the color of bananas. Blue is the color of the sky. Green is the color of trees. I like blue best. My bag is blue. My pen is blue. My cup is blue too. Colors make our world beautiful."),
        ("My Dream","我的梦想","I have a dream. I want to be a doctor. Doctors help sick people. They save lives. I want to help people too. I will study hard. I will learn many things. I will go to a good college. I will make my dream come true.")
    ]
}

print("开始扩充 articles.json")
